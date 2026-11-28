#!/usr/bin/env node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  BACKUP_TABLES,
  EXCLUDED_TABLES,
  EXPECTED_TRIGGERS,
  appliedMigrations,
  integrityReport,
  migrationDifferences,
  readJson,
  requireFile,
  resolveConfig,
  sha256,
  tableCounts,
  wrangler,
} from './lib/d1-ops.mjs';

function parseArgs(argv) {
  const args = {
    mode: 'local',
    from: null,
    config: null,
    report: null,
    allowRemote: false,
    allowSchemaMismatch: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--mode') args.mode = argv[++index];
    else if (value === '--from') args.from = argv[++index];
    else if (value === '--config') args.config = argv[++index];
    else if (value === '--report') args.report = argv[++index];
    else if (value === '--allow-remote') args.allowRemote = true;
    else if (value === '--allow-schema-mismatch') args.allowSchemaMismatch = true;
    else throw new Error(`Argumento desconhecido: ${value}`);
  }
  if (args.from === null) throw new Error('--from é obrigatório (diretório do backup).');
  if (args.mode !== 'local' && args.mode !== 'remote')
    throw new Error('--mode deve ser local ou remote.');
  if (args.mode === 'remote' && !args.allowRemote) {
    throw new Error('Restauração remota exige --allow-remote explícito.');
  }
  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const args = parseArgs(process.argv.slice(2));
const configPath = resolveConfig(args.config);
requireFile(configPath, 'Configuração do Wrangler');
const sourceDir = resolve(process.cwd(), args.from);
const manifestPath = resolve(sourceDir, 'manifest.json');
const dataPath = resolve(sourceDir, 'data.sql');
const schemaPath = resolve(sourceDir, 'schema.sql');
requireFile(manifestPath, 'Manifest');
requireFile(dataPath, 'Dump de dados');
requireFile(schemaPath, 'Schema SQL');

const manifest = readJson(manifestPath);
assert(manifest.backupVersion === 1, 'Versão de backup não suportada.');
const dataChecksumValid = sha256(dataPath) === manifest.files?.['data.sql']?.sha256;
assert(dataChecksumValid, 'Checksum do backup diverge; não restaurar.');
const schemaChecksumValid = sha256(schemaPath) === manifest.files?.['schema.sql']?.sha256;
assert(schemaChecksumValid, 'Checksum de schema.sql diverge; não restaurar.');
const manifestTables = (manifest.tables ?? []).map((table) => table.name).sort();
assert(
  JSON.stringify(manifestTables) === JSON.stringify([...BACKUP_TABLES].sort()),
  'Lista de tabelas do manifest não corresponde ao allowlist.',
);

// Destino e tabelas excluídas são verificados juntos, antes de qualquer mutação.
const targetCountsBefore = tableCounts({ configPath, mode: args.mode });
const excludedCountsBefore = tableCounts({
  configPath,
  mode: args.mode,
  tables: EXCLUDED_TABLES,
});
const nonEmpty = Object.entries({ ...targetCountsBefore, ...excludedCountsBefore }).filter(
  ([, rows]) => rows > 0,
);
assert(
  nonEmpty.length === 0,
  `Destino não está vazio; restauração completa só é permitida em banco vazio: ${nonEmpty.map(([table]) => table).join(', ')}`,
);
const targetEmptyBeforeRestore = nonEmpty.length === 0;

const before = integrityReport({ configPath, mode: args.mode });
assert(
  before.violations === 0,
  'Integridade referencial do destino já estava quebrada antes da restauração.',
);
assert(
  before.integrityCheck.length > 0 && before.integrityCheck.every((result) => result === 'ok'),
  `PRAGMA integrity_check falhou no destino: ${before.integrityCheck.join(', ')}.`,
);
const missingTriggers = EXPECTED_TRIGGERS.filter((name) => !before.triggers.includes(name));
assert(
  missingTriggers.length === 0,
  `Schema incompleto no destino; aplique as migrations antes de restaurar. Faltam: ${missingTriggers.join(', ')}`,
);

assert(Array.isArray(manifest.appliedMigrations), 'Manifest sem appliedMigrations; não restaurar.');
const migrations = migrationDifferences(
  manifest.appliedMigrations,
  appliedMigrations({ configPath, mode: args.mode }),
);
if (!migrations.matches && !args.allowSchemaMismatch) {
  throw new Error(
    `Migrations do manifest divergem do destino: faltam no destino: ${migrations.missingInTarget.join(', ') || 'nenhuma'}; extras no destino: ${migrations.extraInTarget.join(', ') || 'nenhuma'}. Use --allow-schema-mismatch para admitir a divergência explicitamente.`,
  );
}

const manifestFingerprints = manifest.schemaFingerprints ?? null;
const schemaFingerprintDiff = manifestFingerprints
  ? Object.entries(manifestFingerprints)
      .filter(([kind, value]) => before.schemaFingerprints[kind] !== value)
      .map(([kind]) => kind)
  : [];
if (schemaFingerprintDiff.length > 0 && !args.allowSchemaMismatch) {
  throw new Error(
    `Schema do destino diverge do manifest (${schemaFingerprintDiff.join(', ')}). Use --allow-schema-mismatch para admitir a divergência explicitamente.`,
  );
}

wrangler(['d1', 'execute', 'DB', '--file', dataPath], { configPath, mode: args.mode });

// A reexportação usa um diretório temporário fora do backup: nunca grava no sourceDir.
const roundtripDir = mkdtempSync(join(tmpdir(), 'personal-os-restore-'));
let verification;
let ok;
try {
  const roundtripPath = join(roundtripDir, 'data.sql');
  wrangler(
    [
      'd1',
      'export',
      'DB',
      '--no-schema',
      ...BACKUP_TABLES.flatMap((table) => ['--table', table]),
      '--output',
      roundtripPath,
    ],
    { configPath, mode: args.mode, confirmFlag: '--skip-confirmation' },
  );
  const roundtripMatches = sha256(roundtripPath) === manifest.files['data.sql'].sha256;

  const targetCountsAfter = tableCounts({ configPath, mode: args.mode });
  const excludedAfter = tableCounts({ configPath, mode: args.mode, tables: EXCLUDED_TABLES });
  const leakedExcluded = Object.entries(excludedAfter).filter(([, rows]) => rows > 0);
  const mismatch = manifest.tables.filter((table) => targetCountsAfter[table.name] !== table.rows);
  const after = integrityReport({ configPath, mode: args.mode });
  const schemaStable =
    JSON.stringify(before.schemaFingerprints) === JSON.stringify(after.schemaFingerprints);

  verification = {
    verifiedAt: new Date().toISOString(),
    mode: args.mode,
    sourceManifest: manifestPath,
    manifestChecksumValid: dataChecksumValid && schemaChecksumValid,
    targetEmptyBeforeRestore,
    schemaChecksumValid,
    migrations: {
      manifest: migrations.manifest,
      target: migrations.target,
      matches: migrations.matches,
      allowedMismatch: !migrations.matches && args.allowSchemaMismatch,
    },
    schemaFingerprints: {
      manifest: manifestFingerprints,
      before: before.schemaFingerprints,
      after: after.schemaFingerprints,
      diffWithManifest: schemaFingerprintDiff,
      allowedMismatch: schemaFingerprintDiff.length > 0 && args.allowSchemaMismatch,
      stable: schemaStable,
    },
    counts: {
      expected: Object.fromEntries(manifest.tables.map((t) => [t.name, t.rows])),
      actual: targetCountsAfter,
    },
    countMismatches: mismatch,
    excludedTablesAfterRestore: excludedAfter,
    integrity: {
      violationsBefore: before.violations,
      violationsAfter: after.violations,
      checkBefore: before.integrityCheck,
      checkAfter: after.integrityCheck,
      checkStrategy: before.integrityCheckStrategy,
      checkNote: before.integrityCheckNote,
    },
    triggers: {
      expected: EXPECTED_TRIGGERS.length,
      found: after.triggers.filter((t) => EXPECTED_TRIGGERS.includes(t)).length,
    },
    roundtripChecksumMatches: roundtripMatches,
    auditLogRows: targetCountsAfter.audit_log,
    passkeyRows: targetCountsAfter.passkeys,
  };

  ok =
    mismatch.length === 0 &&
    leakedExcluded.length === 0 &&
    after.violations === 0 &&
    after.integrityCheck.every((result) => result === 'ok') &&
    schemaStable &&
    verification.triggers.found === EXPECTED_TRIGGERS.length &&
    roundtripMatches;
} finally {
  rmSync(roundtripDir, { recursive: true, force: true });
}

if (args.report !== null) {
  const reportPath = resolve(process.cwd(), args.report);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(verification, null, 2)}\n`);
}

console.log(ok ? 'Restauração verificada com sucesso.' : 'Restauração FALHOU na verificação.');
console.log(`Tabelas restauradas: ${BACKUP_TABLES.length}`);
console.log(
  `Violações de FK: ${verification.integrity.violationsAfter} | triggers: ${verification.triggers.found}/${EXPECTED_TRIGGERS.length}`,
);
console.log(
  `Tabelas sensíveis excluídas restauradas: ${
    Object.entries(verification.excludedTablesAfterRestore).filter(([, rows]) => rows > 0)
      .length === 0
      ? 'nenhuma'
      : Object.entries(verification.excludedTablesAfterRestore)
          .filter(([, rows]) => rows > 0)
          .map(([table]) => table)
          .join(', ')
  }`,
);
console.log(
  `Checksum de ida e volta: ${verification.roundtripChecksumMatches ? 'igual' : 'DIVERGENTE'}`,
);
console.log(`audit_log: ${verification.auditLogRows} | passkeys: ${verification.passkeyRows}`);
if (args.report !== null) console.log(`Relatório: ${args.report}`);
if (!ok) process.exit(1);
