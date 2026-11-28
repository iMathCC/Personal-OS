#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  BACKUP_TABLES,
  EXCLUDED_TABLES,
  EXPECTED_TRIGGERS,
  ROOT,
  countDrift,
  integrityReport,
  readJson,
  sha256,
  tableCounts,
  tableSetDifferences,
  wrangler,
} from './lib/d1-ops.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const DECISION_TABLES = ['intelligence_alert_states'];

const LIFE_TABLES = [
  'life_import_batches',
  'finance_accounts',
  'finance_categories',
  'finance_transactions',
  'finance_balance_items',
  'health_metrics',
  'health_observations',
  'training_sessions',
  'reading_materials',
  'reading_sessions',
  'reading_notes',
  'time_entries',
];

const BACKUP_FILES = ['manifest.json', 'data.sql', 'schema.sql'];
const ROUNDTRIP_PREFIX = 'personal-os-restore-';

function spawnNode(script, args, cwd) {
  return spawnSync(process.execPath, [resolve(ROOT, script), ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function runNode(script, args, cwd) {
  const result = spawnNode(script, args, cwd);
  if (result.status !== 0) {
    throw new Error(`${script} falhou:\n${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  }
  return result.stdout ?? '';
}

function runNodeExpectFailure(script, args, cwd, expectedMessage) {
  const result = spawnNode(script, args, cwd);
  assert(result.status !== 0, `${script} deveria falhar com: ${expectedMessage}`);
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  assert(
    output.includes(expectedMessage),
    `${script} falhou sem a mensagem esperada (${expectedMessage}):\n${output}`,
  );
  return output;
}

function makeBackupCopy(name, mutate = {}) {
  const dir = join(workDir, 'negative', name);
  mkdirSync(dir, { recursive: true });
  for (const file of BACKUP_FILES) copyFileSync(join(backupDir, file), join(dir, file));
  if (mutate.manifest) {
    const manifestPath = join(dir, 'manifest.json');
    const copy = readJson(manifestPath);
    mutate.manifest(copy);
    writeFileSync(manifestPath, `${JSON.stringify(copy, null, 2)}\n`);
  }
  if (mutate.file) mutate.file(dir);
  return dir;
}

function makeReadOnlyBackup(name, sourceDir) {
  const dir = join(workDir, 'readonly', name);
  mkdirSync(dir, { recursive: true });
  for (const file of BACKUP_FILES) {
    copyFileSync(join(sourceDir, file), join(dir, file));
    chmodSync(join(dir, file), 0o444);
  }
  chmodSync(dir, 0o555);
  assert((statSync(dir).mode & 0o222) === 0, `Cópia ${name} não ficou somente leitura.`);
  return dir;
}

function makeWritableBackup(dir) {
  for (const file of BACKUP_FILES) chmodSync(join(dir, file), 0o644);
  chmodSync(dir, 0o755);
}

function backupSnapshot(dir) {
  return readdirSync(dir)
    .filter((name) => BACKUP_FILES.includes(name))
    .sort()
    .map((name) => `${name}:${sha256(join(dir, name))}`)
    .join('\n');
}

function roundtripDirs() {
  return readdirSync(tmpdir())
    .filter((name) => name.startsWith(ROUNDTRIP_PREFIX))
    .sort();
}

function executeCommand(statement) {
  wrangler(['d1', 'execute', 'DB', '--command', statement], { configPath, mode: 'local' });
}

function restoreAndVerify({ sourceDir, report, extraArgs = [], label }) {
  const sourceBefore = backupSnapshot(sourceDir);
  const tempBefore = roundtripDirs();
  const output = runNode(
    'scripts/restore-d1.mjs',
    [
      '--config',
      configPath,
      '--mode',
      'local',
      '--from',
      sourceDir,
      '--report',
      report,
      ...extraArgs,
    ],
    workDir,
  );
  process.stdout.write(output);
  const leaked = roundtripDirs().filter((name) => !tempBefore.includes(name));
  assert(
    leaked.length === 0,
    `Diretório temporário da reexportação não removido: ${leaked.join(', ')}`,
  );
  assert(
    backupSnapshot(sourceDir) === sourceBefore,
    `A restauração gravou no diretório de origem (${label}).`,
  );
  return readJson(report);
}

mkdirSync('/tmp/opencode', { recursive: true });
const workDir = mkdtempSync('/tmp/opencode/personal-os-drill-');
const configPath = join(workDir, 'wrangler.local.toml');
const migrationsDir = join(workDir, 'migrations');
const backupDir = join(workDir, 'backup');
const reportPath = join(workDir, 'restore-verification.json');

copyFileSync(resolve(ROOT, 'apps/api/wrangler.local.example.toml'), configPath);
symlinkSync(resolve(ROOT, 'apps/api/src'), join(workDir, 'src'));
mkdirSync(migrationsDir);
const sourceMigrations = resolve(ROOT, 'apps/api/migrations');
const migrationFiles = readdirSync(sourceMigrations)
  .filter((name) => name.endsWith('.sql'))
  .sort();

function installMigrations(files) {
  for (const name of files) {
    copyFileSync(join(sourceMigrations, name), join(migrationsDir, name));
  }
}

function applyMigrations() {
  wrangler(['d1', 'migrations', 'apply', 'DB'], {
    configPath,
    mode: 'local',
    confirmFlag: '--force',
  });
}

function executeSql(path) {
  wrangler(['d1', 'execute', 'DB', '--file', path], { configPath, mode: 'local' });
}

console.log(`Drill isolado: ${workDir}`);
console.log('1) Banco vazio + migrations iniciais (0000-0002)');
installMigrations(migrationFiles.slice(0, 3));
applyMigrations();
executeSql(resolve(ROOT, 'scripts/fixtures/drill-data-core.sql'));

console.log('2) Upgrade 0003-0009 com dados existentes + seeds idempotentes');
installMigrations(migrationFiles.slice(3));
applyMigrations();
executeSql(resolve(ROOT, 'packages/db/src/seed.sql'));
executeSql(resolve(ROOT, 'scripts/fixtures/drill-data-studies.sql'));
executeSql(resolve(ROOT, 'scripts/fixtures/drill-data-execution.sql'));
executeSql(resolve(ROOT, 'scripts/fixtures/drill-data-intelligence.sql'));
executeSql(resolve(ROOT, 'scripts/fixtures/drill-data-planning.sql'));
executeSql(resolve(ROOT, 'scripts/fixtures/drill-data-life.sql'));
executeSql(resolve(ROOT, 'scripts/fixtures/drill-data-decision.sql'));
executeSql(resolve(ROOT, 'scripts/fixtures/drill-data-adaptation.sql'));

const sourceCounts = tableCounts({ configPath, mode: 'local' });
const sourceIntegrity = integrityReport({ configPath, mode: 'local' });
assert(sourceIntegrity.violations === 0, 'FK quebrada no banco de origem do drill.');
assert(
  EXPECTED_TRIGGERS.every((name) => sourceIntegrity.triggers.includes(name)),
  'Triggers ausentes no banco de origem do drill.',
);
assert(sourceCounts.audit_log > 0 && sourceCounts.passkeys > 0, 'Fixture incompleta no drill.');
assert(
  sourceCounts.projects > 0 &&
    sourceCounts.project_goals > 0 &&
    sourceCounts.project_milestones > 0 &&
    sourceCounts.tasks > 0 &&
    sourceCounts.task_dependencies > 0,
  'Fixture da camada de execução incompleta no drill.',
);
assert(sourceCounts.weekly_reviews > 0, 'Fixture de revisão semanal incompleta no drill.');
assert(
  sourceCounts.life_vision_versions > 0 &&
    sourceCounts.planning_cycles > 0 &&
    sourceCounts.capacity_profiles > 0 &&
    sourceCounts.planning_scenarios > 0 &&
    sourceCounts.planning_cycle_reviews > 0,
  'Fixture de planejamento estratégico incompleta no drill.',
);
assert(
  LIFE_TABLES.every((table) => sourceCounts[table] > 0),
  'Fixture da camada de dados pessoais incompleta no drill.',
);
assert(
  DECISION_TABLES.every((table) => sourceCounts[table] > 0),
  'Fixture do estado de alertas incompleta no drill.',
);

console.log('3) Exportação lógica com allowlist e manifest');
const backupOutput = runNode(
  'scripts/backup-d1.mjs',
  ['--config', configPath, '--mode', 'local', '--out', backupDir],
  workDir,
);
process.stdout.write(backupOutput);
const manifest = readJson(join(backupDir, 'manifest.json'));
assert(manifest.tables.length === BACKUP_TABLES.length, 'Manifest incompleto.');
assert(
  manifest.rowCounts?.before && manifest.rowCounts?.after,
  'Manifest sem contagens antes/depois.',
);
assert(
  countDrift(manifest.rowCounts.before, manifest.rowCounts.after, BACKUP_TABLES).length === 0,
  'Drift de contagens registrado no manifest.',
);
const manifestCoverage = tableSetDifferences(manifest.userTables ?? []);
assert(
  manifestCoverage.missing.length === 0 && manifestCoverage.unknown.length === 0,
  'userTables do manifest não cobre o schema.',
);
assert(manifest.files?.['schema.sql']?.sha256, 'Manifest sem checksum de schema.sql.');
assert(
  manifest.integrityCheck?.length > 0 && manifest.integrityCheck.every((result) => result === 'ok'),
  'PRAGMA de integridade ausente ou falho no manifest.',
);
assert(manifest.integrityCheckStrategy, 'Estratégia de integridade ausente no manifest.');
assert(
  Object.values(manifest.schemaFingerprints ?? {}).every(
    (value) => typeof value === 'string' && value.length > 0,
  ),
  'Fingerprints de schema ausentes no manifest.',
);

console.log('4) Destruição do banco isolado e reaplicação das migrations');
rmSync(join(workDir, '.wrangler'), { recursive: true, force: true });
installMigrations(migrationFiles);
applyMigrations();
const emptyCounts = tableCounts({ configPath, mode: 'local' });
assert(
  Object.values(emptyCounts).every((rows) => rows === 0),
  'Banco de destino do drill não ficou vazio.',
);

console.log('5) Falhas fechadas antes de qualquer mutação no destino');
const badDataDir = makeBackupCopy('bad-data', {
  file: (dir) => appendFileSync(join(dir, 'data.sql'), '\n-- drill: checksum inválido\n'),
});
runNodeExpectFailure(
  'scripts/restore-d1.mjs',
  ['--config', configPath, '--mode', 'local', '--from', badDataDir],
  workDir,
  'Checksum do backup diverge; não restaurar.',
);

const badSchemaDir = makeBackupCopy('bad-schema', {
  file: (dir) => appendFileSync(join(dir, 'schema.sql'), '\n-- drill: checksum inválido\n'),
});
runNodeExpectFailure(
  'scripts/restore-d1.mjs',
  ['--config', configPath, '--mode', 'local', '--from', badSchemaDir],
  workDir,
  'Checksum de schema.sql diverge; não restaurar.',
);

const manifestDriftDir = makeBackupCopy('manifest-drift', {
  manifest: (copy) => {
    copy.tables = copy.tables.slice(1);
  },
});
runNodeExpectFailure(
  'scripts/restore-d1.mjs',
  ['--config', configPath, '--mode', 'local', '--from', manifestDriftDir],
  workDir,
  'Lista de tabelas do manifest não corresponde ao allowlist.',
);

const migrationMismatchDir = makeBackupCopy('migrations', {
  manifest: (copy) => {
    assert(copy.appliedMigrations.length > 1, 'Fixture de migrations insuficiente.');
    copy.appliedMigrations = copy.appliedMigrations.slice(0, -1);
  },
});
runNodeExpectFailure(
  'scripts/restore-d1.mjs',
  ['--config', configPath, '--mode', 'local', '--from', migrationMismatchDir],
  workDir,
  'Migrations do manifest divergem do destino',
);

executeCommand('CREATE TABLE drill_unknown_table (id INTEGER PRIMARY KEY);');
try {
  runNodeExpectFailure(
    'scripts/backup-d1.mjs',
    [
      '--config',
      configPath,
      '--mode',
      'local',
      '--out',
      join(workDir, 'negative', 'unknown-export'),
    ],
    workDir,
    'tabelas desconhecidas no banco: drill_unknown_table',
  );
} finally {
  executeCommand('DROP TABLE drill_unknown_table;');
}

console.log('6) Restauração validada a partir de diretório somente leitura');
const readOnlyBackupDir = makeReadOnlyBackup('valid', backupDir);
let verification;
try {
  verification = restoreAndVerify({
    sourceDir: readOnlyBackupDir,
    report: reportPath,
    label: 'backup válido',
  });
} finally {
  makeWritableBackup(readOnlyBackupDir);
}

assert(verification.targetEmptyBeforeRestore === true, 'Precheck de destino vazio não registrado.');
assert(
  verification.manifestChecksumValid && verification.schemaChecksumValid,
  'Checksums do manifest não validados.',
);
assert(
  verification.migrations.matches && !verification.migrations.allowedMismatch,
  'Migrations válidas rejeitadas.',
);
assert(verification.schemaFingerprints.stable, 'Schema mudou durante a restauração.');
assert(
  verification.integrity.checkAfter.length > 0 &&
    verification.integrity.checkAfter.every((result) => result === 'ok'),
  'PRAGMA de integridade falhou após a restauração.',
);
assert(verification.integrity.checkStrategy, 'Estratégia de integridade ausente no relatório.');
assert(verification.countMismatches.length === 0, 'Contagens divergentes após restauração.');
assert(verification.integrity.violationsAfter === 0, 'FK quebrada após restauração.');
assert(
  verification.triggers.found === EXPECTED_TRIGGERS.length,
  'Triggers perdidos na restauração.',
);
assert(verification.roundtripChecksumMatches, 'Checksum de ida e volta divergente.');
assert(
  LIFE_TABLES.every(
    (table) => verification.counts.actual[table] === sourceCounts[table] && sourceCounts[table] > 0,
  ),
  'Tabelas de dados pessoais não foram restauradas integralmente.',
);
assert(
  DECISION_TABLES.every(
    (table) => verification.counts.actual[table] === sourceCounts[table] && sourceCounts[table] > 0,
  ),
  'Estado de alertas não foi restaurado integralmente.',
);
assert(verification.auditLogRows > 0, 'audit_log não preservado.');
assert(verification.passkeyRows > 0, 'passkeys não preservadas.');
assert(
  Object.values(verification.excludedTablesAfterRestore).every((rows) => rows === 0),
  'Tabelas sensíveis foram restauradas indevidamente.',
);
assert(
  EXCLUDED_TABLES.every((table) => table in verification.excludedTablesAfterRestore),
  'Verificação incompleta das tabelas excluídas.',
);

console.log('7) Precheck de tabelas excluídas com destino já populado');
const reportChecksum = sha256(reportPath);
executeCommand(
  'INSERT INTO rate_limits ("key", "window_start", "expires_at") VALUES (\'drill-restore-guard\', \'2026-01-01T00:00:00.000Z\', \'2027-01-01T00:00:00.000Z\');',
);
try {
  runNodeExpectFailure(
    'scripts/restore-d1.mjs',
    ['--config', configPath, '--mode', 'local', '--from', backupDir],
    workDir,
    'Destino não está vazio',
  );
  assert(sha256(reportPath) === reportChecksum, 'Restauração falha sobrescreveu o relatório.');
  const guardedCounts = tableCounts({ configPath, mode: 'local' });
  assert(
    guardedCounts.audit_log === sourceCounts.audit_log,
    'Falha no precheck alterou os dados restaurados.',
  );
} finally {
  executeCommand('DELETE FROM rate_limits WHERE "key" = \'drill-restore-guard\';');
}
const excludedAfterGuard = tableCounts({ configPath, mode: 'local', tables: EXCLUDED_TABLES });
assert(
  Object.values(excludedAfterGuard).every((rows) => rows === 0),
  'Linha de teste nas tabelas excluídas não foi removida.',
);

console.log('8) Reexecução dos seeds (idempotência após restauração)');
executeSql(resolve(ROOT, 'packages/db/src/seed.sql'));
const finalCounts = tableCounts({ configPath, mode: 'local' });
assert(
  JSON.stringify(finalCounts) === JSON.stringify(sourceCounts),
  'Seeds não idempotentes após restauração.',
);

console.log('9) Divergência de migrations com autorização explícita');
rmSync(join(workDir, '.wrangler'), { recursive: true, force: true });
installMigrations(migrationFiles);
applyMigrations();
const waiverEmptyCounts = tableCounts({ configPath, mode: 'local' });
assert(
  Object.values(waiverEmptyCounts).every((rows) => rows === 0),
  'Destino da restauração autorizada não ficou vazio.',
);
const waiverReportPath = join(workDir, 'restore-verification-allow-mismatch.json');
const readOnlyMismatchDir = makeReadOnlyBackup('mismatch', migrationMismatchDir);
let waiverVerification;
try {
  waiverVerification = restoreAndVerify({
    sourceDir: readOnlyMismatchDir,
    report: waiverReportPath,
    extraArgs: ['--allow-schema-mismatch'],
    label: 'migrations divergentes',
  });
} finally {
  makeWritableBackup(readOnlyMismatchDir);
}
assert(
  waiverVerification.migrations.matches === false,
  'Divergência de migrations não exercitada.',
);
assert(
  waiverVerification.migrations.allowedMismatch === true,
  'Flag de divergência não registrada.',
);
assert(
  waiverVerification.countMismatches.length === 0,
  'Restauração autorizada divergiu nas contagens.',
);
assert(
  BACKUP_TABLES.every((table) => waiverVerification.counts.actual[table] === sourceCounts[table]),
  'Contagens divergentes na restauração autorizada.',
);
assert(
  waiverVerification.roundtripChecksumMatches,
  'Checksum de ida e volta divergente na restauração autorizada.',
);
assert(
  waiverVerification.targetEmptyBeforeRestore,
  'Destino vazio não registrado na restauração autorizada.',
);

const summary = {
  drillOk: true,
  workDir,
  backupDir,
  reportPath,
  waiverReportPath,
  sourceCounts,
  restoredCounts: verification.counts.actual,
  waiverRestoredCounts: waiverVerification.counts.actual,
  excludedTablesAfterRestore: verification.excludedTablesAfterRestore,
  migrations: manifest.appliedMigrations,
  integrityCheckStrategy: verification.integrity.checkStrategy,
  integrityCheckNote: verification.integrity.checkNote,
  negativeCases: [
    'checksum de data.sql',
    'checksum de schema.sql',
    'drift de tabelas no manifest',
    'tabela desconhecida no allowlist',
    'divergência de migrations sem autorização',
    'linha em tabela excluída no destino',
  ],
  readOnlySourceVerified: true,
};
writeFileSync(join(workDir, 'drill-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(
  '\nDrill concluído: migrations em vazio, upgrade com dados, export, destruição isolada, restauração, seeds idempotentes, falhas fechadas e origem somente leitura verificados.',
);
console.log(`Resumo: ${join(workDir, 'drill-summary.json')}`);
