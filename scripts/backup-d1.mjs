#!/usr/bin/env node
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BACKUP_TABLES,
  EXCLUDED_TABLES,
  appliedMigrations,
  requireFile,
  resolveConfig,
  sha256,
  tableCounts,
  wrangler,
} from './lib/d1-ops.mjs';

function parseArgs(argv) {
  const args = { mode: 'local', out: null, config: null, allowRemote: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--mode') args.mode = argv[++index];
    else if (value === '--out') args.out = argv[++index];
    else if (value === '--config') args.config = argv[++index];
    else if (value === '--allow-remote') args.allowRemote = true;
    else throw new Error(`Argumento desconhecido: ${value}`);
  }
  if (args.mode !== 'local' && args.mode !== 'remote')
    throw new Error('--mode deve ser local ou remote.');
  if (args.mode === 'remote' && !args.allowRemote) {
    throw new Error('Backup remoto exige --allow-remote explícito.');
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const configPath = resolveConfig(args.config);
requireFile(configPath, 'Configuração do Wrangler');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = resolve(process.cwd(), args.out ?? `backups/d1-${stamp}`);
mkdirSync(outputDir, { recursive: true });

const counts = tableCounts({ configPath, mode: args.mode });
const dataPath = resolve(outputDir, 'data.sql');
const schemaPath = resolve(outputDir, 'schema.sql');

wrangler(
  [
    'd1',
    'export',
    'DB',
    '--no-schema',
    ...BACKUP_TABLES.flatMap((table) => ['--table', table]),
    '--output',
    dataPath,
  ],
  { configPath, mode: args.mode, confirmFlag: '--skip-confirmation' },
);
wrangler(['d1', 'export', 'DB', '--no-data', '--output', schemaPath], {
  configPath,
  mode: args.mode,
  confirmFlag: '--skip-confirmation',
});

const manifest = {
  backupVersion: 1,
  generatedAt: new Date().toISOString(),
  database: 'DB',
  mode: args.mode,
  config: args.config ?? 'apps/api/wrangler.local.toml',
  tables: BACKUP_TABLES.map((name) => ({ name, rows: counts[name] })),
  excludedTables: EXCLUDED_TABLES,
  appliedMigrations: appliedMigrations({ configPath, mode: args.mode }),
  files: {
    'data.sql': { bytes: statSync(dataPath).size, sha256: sha256(dataPath) },
    'schema.sql': { bytes: statSync(schemaPath).size, sha256: sha256(schemaPath) },
  },
};

const manifestPath = resolve(outputDir, 'manifest.json');
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

// Verificação imediata: o checksum registrado precisa corresponder ao arquivo final.
if (sha256(dataPath) !== manifest.files['data.sql'].sha256) {
  throw new Error('Falha na verificação do backup: checksum de data.sql diverge.');
}

const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
console.log(`Backup criado em ${outputDir}`);
console.log(`Tabelas: ${BACKUP_TABLES.length} | linhas: ${total}`);
console.log(`Migrations: ${manifest.appliedMigrations.join(', ') || 'nenhuma'}`);
console.log(`SHA-256 data.sql: ${manifest.files['data.sql'].sha256}`);
console.log(`Excluídas por política: ${EXCLUDED_TABLES.join(', ')}`);
