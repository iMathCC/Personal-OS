#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  BACKUP_TABLES,
  EXCLUDED_TABLES,
  EXPECTED_TRIGGERS,
  integrityReport,
  readJson,
  requireFile,
  resolveConfig,
  sha256,
  tableCounts,
  wrangler,
} from './lib/d1-ops.mjs';

function parseArgs(argv) {
  const args = { mode: 'local', from: null, config: null, report: null, allowRemote: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--mode') args.mode = argv[++index];
    else if (value === '--from') args.from = argv[++index];
    else if (value === '--config') args.config = argv[++index];
    else if (value === '--report') args.report = argv[++index];
    else if (value === '--allow-remote') args.allowRemote = true;
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
requireFile(manifestPath, 'Manifest');
requireFile(dataPath, 'Dump de dados');

const manifest = readJson(manifestPath);
assert(manifest.backupVersion === 1, 'Versão de backup não suportada.');
assert(
  sha256(dataPath) === manifest.files?.['data.sql']?.sha256,
  'Checksum do backup diverge; não restaurar.',
);
const manifestTables = (manifest.tables ?? []).map((table) => table.name).sort();
assert(
  JSON.stringify(manifestTables) === JSON.stringify([...BACKUP_TABLES].sort()),
  'Lista de tabelas do manifest não corresponde ao allowlist.',
);

const targetCountsBefore = tableCounts({ configPath, mode: args.mode });
const nonEmpty = Object.entries(targetCountsBefore).filter(([, rows]) => rows > 0);
assert(
  nonEmpty.length === 0,
  `Destino não está vazio; restauração completa só é permitida em banco vazio: ${nonEmpty.map(([table]) => table).join(', ')}`,
);

const before = integrityReport({ configPath, mode: args.mode });
assert(
  before.violations === 0,
  'Integridade referencial do destino já estava quebrada antes da restauração.',
);
const missingTriggers = EXPECTED_TRIGGERS.filter((name) => !before.triggers.includes(name));
assert(
  missingTriggers.length === 0,
  `Schema incompleto no destino; aplique as migrations antes de restaurar. Faltam: ${missingTriggers.join(', ')}`,
);

wrangler(['d1', 'execute', 'DB', '--file', dataPath], { configPath, mode: args.mode });

const targetCountsAfter = tableCounts({ configPath, mode: args.mode });
const excludedAfter = tableCounts({ configPath, mode: args.mode, tables: EXCLUDED_TABLES });
const leakedExcluded = Object.entries(excludedAfter).filter(([, rows]) => rows > 0);
const mismatch = manifest.tables.filter((table) => targetCountsAfter[table.name] !== table.rows);
const after = integrityReport({ configPath, mode: args.mode });

// Reexportação determinística: confirma que IDs, relações e valores foram preservados.
const roundtripPath = resolve(sourceDir, '.restore-roundtrip.sql');
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

const verification = {
  verifiedAt: new Date().toISOString(),
  mode: args.mode,
  sourceManifest: manifestPath,
  manifestChecksumValid: true,
  targetEmptyBeforeRestore: true,
  counts: {
    expected: Object.fromEntries(manifest.tables.map((t) => [t.name, t.rows])),
    actual: targetCountsAfter,
  },
  countMismatches: mismatch,
  excludedTablesAfterRestore: excludedAfter,
  integrity: { violationsBefore: before.violations, violationsAfter: after.violations },
  triggers: {
    expected: EXPECTED_TRIGGERS.length,
    found: after.triggers.filter((t) => EXPECTED_TRIGGERS.includes(t)).length,
  },
  roundtripChecksumMatches: roundtripMatches,
  auditLogRows: targetCountsAfter.audit_log,
  passkeyRows: targetCountsAfter.passkeys,
};

const ok =
  mismatch.length === 0 &&
  leakedExcluded.length === 0 &&
  after.violations === 0 &&
  verification.triggers.found === EXPECTED_TRIGGERS.length &&
  roundtripMatches;

if (args.report !== null) {
  const reportPath = resolve(process.cwd(), args.report);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(verification, null, 2)}\n`);
}

console.log(ok ? 'Restauração verificada com sucesso.' : 'Restauração FALHOU na verificação.');
console.log(`Tabelas restauradas: ${BACKUP_TABLES.length}`);
console.log(
  `Violações de FK: ${after.violations} | triggers: ${verification.triggers.found}/${EXPECTED_TRIGGERS.length}`,
);
console.log(
  `Tabelas sensíveis excluídas restauradas: ${leakedExcluded.length === 0 ? 'nenhuma' : leakedExcluded.map(([table]) => table).join(', ')}`,
);
console.log(`Checksum de ida e volta: ${roundtripMatches ? 'igual' : 'DIVERGENTE'}`);
console.log(`audit_log: ${verification.auditLogRows} | passkeys: ${verification.passkeyRows}`);
if (args.report !== null) console.log(`Relatório: ${args.report}`);
if (!ok) process.exit(1);
