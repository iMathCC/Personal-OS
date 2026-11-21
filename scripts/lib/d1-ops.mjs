import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WRANGLER = resolve(ROOT, 'node_modules/wrangler/bin/wrangler.js');

/**
 * Dados de domínio, configuração, auditoria e credenciais públicas de passkey.
 * Tabelas de sessão/token/challenge/rate limit são reconstruíveis e contêm
 * segredos ou hashes: ficam de fora do backup lógico por política de segurança.
 */
export const BACKUP_TABLES = Object.freeze([
  'app_settings',
  'sources',
  'areas',
  'users',
  'metrics',
  'goals',
  'goal_metrics',
  'courses',
  'study_sessions',
  'metric_observations',
  'events',
  'audit_log',
  'operation_results',
  'idempotency_key_reservations',
  'passkeys',
]);

export const EXCLUDED_TABLES = Object.freeze([
  'auth_challenges',
  'idempotency_keys',
  'rate_limits',
  'recovery_codes',
  'recovery_tokens',
  'sessions',
]);

export const EXPECTED_TRIGGERS = Object.freeze([
  'audit_log_no_update',
  'audit_log_no_delete',
  'audit_log_no_replace',
  'sessions_active_limit',
  'idempotency_key_reservations_no_update',
  'idempotency_key_reservations_no_delete',
  'operation_results_no_update',
  'operation_results_no_delete',
  'metric_observations_immutable_values',
  'metric_observations_supersede_once',
  'study_sessions_delete_once',
]);

export function wrangler(args, { configPath, mode = 'local', confirmFlag = '--yes' } = {}) {
  const full = [
    WRANGLER,
    ...args,
    ...(configPath === undefined ? [] : ['--config', configPath]),
    ...(mode === 'local' ? ['--local'] : ['--remote']),
    confirmFlag,
  ];
  const result = spawnSync(process.execPath, full, {
    cwd: configPath === undefined ? ROOT : dirname(configPath),
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const detail = (result.stderr ?? '').trim();
    throw new Error(`wrangler ${args.join(' ')} falhou (${result.status}):\n${detail}`);
  }
  return result.stdout ?? '';
}

function parseJsonResult(stdout) {
  const start = stdout.indexOf('[');
  if (start === -1) throw new Error('wrangler não retornou JSON.');
  return JSON.parse(stdout.slice(start));
}

/** Uma invocação para todas as contagens; reduz leituras e mantém o snapshot coerente. */
export function tableCounts({ configPath, mode, tables = BACKUP_TABLES }) {
  const command = tables
    .map((table) => `SELECT '${table}' AS t, count(*) AS n FROM "${table}";`)
    .join('\n');
  const output = wrangler(['d1', 'execute', 'DB', '--json', '--command', command], {
    configPath,
    mode,
  });
  const results = parseJsonResult(output);
  const counts = {};
  for (const group of results) {
    if (group.success === false)
      throw new Error(`Falha ao contar tabelas: ${JSON.stringify(group)}`);
    const row = group.results?.[0];
    if (row === undefined) throw new Error('Resultado de contagem vazio.');
    counts[row.t] = row.n;
  }
  for (const table of tables) {
    if (!Number.isInteger(counts[table])) throw new Error(`Contagem ausente: ${table}`);
  }
  return counts;
}

export function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function appliedMigrations({ configPath, mode }) {
  const output = wrangler(
    ['d1', 'execute', 'DB', '--json', '--command', 'SELECT name FROM d1_migrations ORDER BY name;'],
    { configPath, mode },
  );
  const results = parseJsonResult(output);
  return results.flatMap((group) => (group.results ?? []).map((row) => row.name));
}

export function integrityReport({ configPath, mode }) {
  const output = wrangler(
    [
      'd1',
      'execute',
      'DB',
      '--json',
      '--command',
      "SELECT 'fk' AS kind, count(*) AS n FROM pragma_foreign_key_check(); SELECT 'trigger' AS kind, name FROM sqlite_master WHERE type = 'trigger';",
    ],
    { configPath, mode },
  );
  const results = parseJsonResult(output);
  const rows = results.flatMap((group) => group.results ?? []);
  const violations = rows.filter((row) => row.kind === 'fk').reduce((sum, row) => sum + row.n, 0);
  const triggers = rows
    .filter((row) => row.kind === 'trigger' && typeof row.name === 'string')
    .map((row) => row.name);
  return { violations, triggers };
}

export function requireFile(path, label) {
  if (!existsSync(path)) throw new Error(`${label} não encontrado: ${path}`);
}

export function resolveConfig(value) {
  return resolve(ROOT, value ?? 'apps/api/wrangler.local.toml');
}
