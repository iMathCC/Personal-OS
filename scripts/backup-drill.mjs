#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import {
  BACKUP_TABLES,
  EXCLUDED_TABLES,
  EXPECTED_TRIGGERS,
  ROOT,
  integrityReport,
  readJson,
  tableCounts,
  wrangler,
} from './lib/d1-ops.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runNode(script, args, cwd) {
  const result = spawnSync(process.execPath, [resolve(ROOT, script), ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`${script} falhou:\n${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  }
  return result.stdout ?? '';
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

console.log('2) Upgrade 0003 com dados existentes + seeds idempotentes');
installMigrations(migrationFiles.slice(3));
applyMigrations();
executeSql(resolve(ROOT, 'packages/db/src/seed.sql'));
executeSql(resolve(ROOT, 'scripts/fixtures/drill-data-studies.sql'));

const sourceCounts = tableCounts({ configPath, mode: 'local' });
const sourceIntegrity = integrityReport({ configPath, mode: 'local' });
assert(sourceIntegrity.violations === 0, 'FK quebrada no banco de origem do drill.');
assert(
  EXPECTED_TRIGGERS.every((name) => sourceIntegrity.triggers.includes(name)),
  'Triggers ausentes no banco de origem do drill.',
);
assert(sourceCounts.audit_log > 0 && sourceCounts.passkeys > 0, 'Fixture incompleta no drill.');

console.log('3) Exportação lógica com allowlist e manifest');
const backupOutput = runNode(
  'scripts/backup-d1.mjs',
  ['--config', configPath, '--mode', 'local', '--out', backupDir],
  workDir,
);
process.stdout.write(backupOutput);
const manifest = readJson(join(backupDir, 'manifest.json'));
assert(manifest.tables.length === BACKUP_TABLES.length, 'Manifest incompleto.');

console.log('4) Destruição do banco isolado e reaplicação das migrations');
rmSync(join(workDir, '.wrangler'), { recursive: true, force: true });
installMigrations(migrationFiles);
applyMigrations();
const emptyCounts = tableCounts({ configPath, mode: 'local' });
assert(
  Object.values(emptyCounts).every((rows) => rows === 0),
  'Banco de destino do drill não ficou vazio.',
);

console.log('5) Restauração e verificação');
const restoreOutput = runNode(
  'scripts/restore-d1.mjs',
  ['--config', configPath, '--mode', 'local', '--from', backupDir, '--report', reportPath],
  workDir,
);
process.stdout.write(restoreOutput);

const verification = readJson(reportPath);
assert(verification.countMismatches.length === 0, 'Contagens divergentes após restauração.');
assert(verification.integrity.violationsAfter === 0, 'FK quebrada após restauração.');
assert(
  verification.triggers.found === EXPECTED_TRIGGERS.length,
  'Triggers perdidos na restauração.',
);
assert(verification.roundtripChecksumMatches, 'Checksum de ida e volta divergente.');
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

console.log('6) Reexecução dos seeds (idempotência após restauração)');
executeSql(resolve(ROOT, 'packages/db/src/seed.sql'));
const finalCounts = tableCounts({ configPath, mode: 'local' });
assert(
  JSON.stringify(finalCounts) === JSON.stringify(sourceCounts),
  'Seeds não idempotentes após restauração.',
);

const summary = {
  drillOk: true,
  workDir,
  backupDir,
  reportPath,
  sourceCounts,
  restoredCounts: verification.counts.actual,
  excludedTablesAfterRestore: verification.excludedTablesAfterRestore,
  migrations: manifest.appliedMigrations,
};
writeFileSync(join(workDir, 'drill-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(
  '\nDrill concluído: migrations em vazio, upgrade com dados, export, destruição isolada, restauração e seeds idempotentes verificados.',
);
console.log(`Resumo: ${join(workDir, 'drill-summary.json')}`);
