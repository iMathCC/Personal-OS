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
  'goal_milestones',
  'projects',
  'project_goals',
  'project_milestones',
  'tasks',
  'task_dependencies',
  'courses',
  'study_sessions',
  'metric_observations',
  'events',
  'audit_log',
  'operation_results',
  'idempotency_key_reservations',
  'passkeys',
  'weekly_reviews',
  'life_vision_versions',
  'strategic_area_profiles',
  'strategic_goals',
  'planning_cycles',
  'planning_cycle_objectives',
  'capacity_profiles',
  'capacity_unavailability',
  'planning_scenarios',
  'planning_cycle_reviews',
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
  'intelligence_alert_states',
  'adaptation_decisions',
  'personal_observations',
]);

export const EXCLUDED_TABLES = Object.freeze([
  'auth_challenges',
  'idempotency_keys',
  'rate_limits',
  'recovery_codes',
  'recovery_tokens',
  'sessions',
]);

/** Tabela de controle criada pelo Wrangler; não é dado de domínio nem segredo. */
export const MANAGED_TABLES = Object.freeze(['d1_migrations']);

export const EXPECTED_TRIGGERS = Object.freeze([
  'audit_log_no_update',
  'audit_log_no_delete',
  'audit_log_no_replace',
  'sessions_active_limit',
  'idempotency_key_reservations_no_update',
  'idempotency_key_reservations_no_delete',
  'idempotency_key_reservations_no_replace',
  'operation_results_no_update',
  'operation_results_no_delete',
  'operation_results_no_replace',
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
    const stderr = (result.stderr ?? '').trim();
    const stdout = (result.stdout ?? '').trim();
    // Wrangler reporta erros de SQL no stdout; sem isso a falha chega vazia.
    const detail = stderr || stdout;
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

/** Tabelas de usuário do SQLite; as internas `sqlite_%` nunca entram no allowlist. */
export function userTables({ configPath, mode }) {
  const output = wrangler(
    [
      'd1',
      'execute',
      'DB',
      '--json',
      '--command',
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;",
    ],
    { configPath, mode },
  );
  return parseJsonResult(output).flatMap((group) => {
    if (group.success === false)
      throw new Error(`Falha ao listar tabelas: ${JSON.stringify(group)}`);
    return (group.results ?? []).map((row) => row.name);
  });
}

/**
 * Compara o universo real de tabelas com a união dos allowlists. Qualquer
 * diferença é uma mudança de schema ainda não revisada: falha fechada.
 */
export function tableSetDifferences(
  actualTables,
  {
    backupTables = BACKUP_TABLES,
    excludedTables = EXCLUDED_TABLES,
    managedTables = MANAGED_TABLES,
  } = {},
) {
  const expected = new Set([...backupTables, ...excludedTables, ...managedTables]);
  const actual = new Set(actualTables);
  return {
    expected: [...expected].sort(),
    actual: [...actual].sort(),
    missing: [...expected].filter((name) => !actual.has(name)).sort(),
    unknown: [...actual].filter((name) => !expected.has(name)).sort(),
  };
}

/** Drift de contagens entre duas leituras; usado antes e depois do export. */
export function countDrift(before, after, tables) {
  return tables
    .filter((table) => before[table] !== after[table])
    .map((table) => ({ table, before: before[table], after: after[table] }));
}

export function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function fingerprint(values) {
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

/** Compara a lista ordenada de migrations do manifest com a do banco de destino. */
export function migrationDifferences(manifestMigrations, targetMigrations) {
  const expected = [...manifestMigrations];
  const actual = [...targetMigrations];
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return {
    manifest: expected,
    target: actual,
    matches: JSON.stringify(expected) === JSON.stringify(actual),
    missingInTarget: expected.filter((name) => !actualSet.has(name)),
    extraInTarget: actual.filter((name) => !expectedSet.has(name)),
  };
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

function pragmaCheck({ configPath, mode }) {
  const attempt = (command, strategy) => {
    try {
      const output = wrangler(['d1', 'execute', 'DB', '--json', '--command', command], {
        configPath,
        mode,
      });
      const results = parseJsonResult(output);
      const values = results.flatMap((group) => {
        if (group.success === false)
          throw new Error(`Falha na auditoria de integridade: ${JSON.stringify(group)}`);
        return (group.results ?? []).map(
          (row) => row.integrity_check ?? row.quick_check ?? row.result,
        );
      });
      return { strategy, values, note: null };
    } catch (error) {
      if (!/not authorized|SQLITE_AUTH/i.test(String(error))) throw error;
      return null;
    }
  };

  const full = attempt('PRAGMA integrity_check;', 'integrity_check');
  if (full) return full;
  const quick = attempt('PRAGMA quick_check;', 'quick_check');
  if (quick) {
    return {
      ...quick,
      note: 'PRAGMA integrity_check não é autorizado pelo D1; PRAGMA quick_check usado no lugar.',
    };
  }
  throw new Error('Nenhum pragma de integridade disponível no D1.');
}

export function integrityReport({ configPath, mode }) {
  const command = [
    "SELECT 'fk' AS kind, count(*) AS n FROM pragma_foreign_key_check();",
    "SELECT 'trigger' AS kind, name FROM sqlite_master WHERE type = 'trigger' AND name NOT LIKE 'sqlite_%' ORDER BY name;",
    "SELECT 'object' AS kind, type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name;",
    "SELECT 'column' AS kind, t.name AS tbl, c.cid AS cid, c.name AS name, c.type AS type, c.[notnull] AS required, c.dflt_value AS dflt_value, c.pk AS pk FROM (SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name) t JOIN pragma_table_info(t.name) c ORDER BY t.name, c.cid;",
    "SELECT 'index' AS kind, name, tbl_name, sql FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name;",
    "SELECT 'index_column' AS kind, il.name AS idx, ii.seqno AS seqno, ii.name AS col FROM (SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name) il JOIN pragma_index_info(il.name) ii ORDER BY il.name, ii.seqno;",
  ].join('\n');
  const output = wrangler(['d1', 'execute', 'DB', '--json', '--command', command], {
    configPath,
    mode,
  });
  const results = parseJsonResult(output);
  const rows = results.flatMap((group) => {
    if (group.success === false)
      throw new Error(`Falha na auditoria de integridade: ${JSON.stringify(group)}`);
    return group.results ?? [];
  });
  const byKind = (kind) => rows.filter((row) => row.kind === kind);
  const violations = byKind('fk').reduce((sum, row) => sum + row.n, 0);
  const triggers = byKind('trigger')
    .filter((row) => typeof row.name === 'string')
    .map((row) => row.name);
  const pragma = pragmaCheck({ configPath, mode });
  const objects = byKind('object').map((row) => [row.type, row.name, row.tbl_name, row.sql]);
  const columns = byKind('column').map((row) => [
    row.tbl,
    row.cid,
    row.name,
    row.type,
    row.required,
    row.dflt_value,
    row.pk,
  ]);
  const indexes = byKind('index').map((row) => [row.name, row.tbl_name, row.sql]);
  const indexColumns = byKind('index_column').map((row) => [row.idx, row.seqno, row.col]);
  return {
    violations,
    triggers,
    integrityCheck: pragma.values,
    integrityCheckStrategy: pragma.strategy,
    integrityCheckNote: pragma.note,
    schemaFingerprints: {
      objects: fingerprint(objects),
      columns: fingerprint(columns),
      indexes: fingerprint([...indexes, ...indexColumns]),
    },
  };
}

export function requireFile(path, label) {
  if (!existsSync(path)) throw new Error(`${label} não encontrado: ${path}`);
}

export function resolveConfig(value) {
  return resolve(ROOT, value ?? 'apps/api/wrangler.local.toml');
}
