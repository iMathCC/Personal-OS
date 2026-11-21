import { env } from 'cloudflare:workers';
import initMigration from '../../migrations/0000_init.sql?raw';
import integrityMigration from '../../migrations/0001_audit_append_only.sql?raw';
import replaceGuardMigration from '../../migrations/0002_audit_no_replace.sql?raw';

export type Binding = string | number | null | Uint8Array | ArrayBuffer;

export const USER_ID = '01a1fb52-074d-7043-a390-6e59235799d4';
export const OTHER_USER_ID = '01a1fb52-074d-7043-a390-71e7d32278a1';
export const AREA_ID = '01a1fb52-074d-7043-a390-755bd43bc886';
export const SOURCE_ID = 'src_manual';

export function testDb(): D1Database {
  return env.DB_TEST;
}

const DROP_ORDER = [
  'audit_log',
  'auth_challenges',
  'idempotency_keys',
  'passkeys',
  'rate_limits',
  'recovery_codes',
  'recovery_tokens',
  'sessions',
  'areas',
  'sources',
  'users',
  'app_settings',
];

export async function resetDatabase(): Promise<void> {
  const database = testDb();

  const triggers = await database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name NOT LIKE 'sqlite_%'")
    .all<{ name: string }>();
  for (const trigger of triggers.results) {
    await database.exec(`DROP TRIGGER IF EXISTS "${trigger.name}"`);
  }

  for (const table of DROP_ORDER) {
    await database.exec(`DROP TABLE IF EXISTS "${table}"`);
  }

  // Remove qualquer objeto leftover (por exemplo, tabela de versões do Wrangler).
  const remaining = await database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all<{ name: string }>();
  for (const table of remaining.results) {
    await database.exec(`DROP TABLE IF EXISTS "${table.name}"`);
  }
}

export async function executeSql(sql: string): Promise<void> {
  // O `exec()` do D1 em Workers falha com "incomplete input" quando uma
  // statement ocupa várias linhas. Comentários também precisam sair antes de
  // colapsar: `--` passaria a comentar o resto do arquivo inteiro.
  const normalized = sql
    .replace(/-->\s*statement-breakpoint/g, ' ')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length > 0) {
    await testDb().exec(normalized);
  }
}

export async function applyMigration(sql: string): Promise<void> {
  await executeSql(sql);
}

export async function applyInitialSchema(): Promise<void> {
  await applyMigration(initMigration);
}

export async function applyIntegrityMigration(): Promise<void> {
  await applyMigration(integrityMigration);
}

export async function applyReplaceGuardMigration(): Promise<void> {
  await applyMigration(replaceGuardMigration);
}

export async function applyFullSchema(): Promise<void> {
  await applyInitialSchema();
  await applyIntegrityMigration();
  await applyReplaceGuardMigration();
}

export async function all<T>(sql: string, ...values: Binding[]): Promise<T[]> {
  const statement =
    values.length === 0
      ? testDb().prepare(sql)
      : testDb()
          .prepare(sql)
          .bind(...values);
  const result = await statement.all<T>();
  return result.results;
}

export async function first<T>(sql: string, ...values: Binding[]): Promise<T> {
  const statement =
    values.length === 0
      ? testDb().prepare(sql)
      : testDb()
          .prepare(sql)
          .bind(...values);
  const row = await statement.first<T>();
  if (row === null) {
    throw new Error('Esperava uma linha, mas a consulta não retornou resultados.');
  }
  return row;
}

export async function run(sql: string, ...values: Binding[]): Promise<void> {
  const statement =
    values.length === 0
      ? testDb().prepare(sql)
      : testDb()
          .prepare(sql)
          .bind(...values);
  await statement.run();
}

export async function insertUser(id = USER_ID): Promise<void> {
  await run('INSERT INTO users (id, display_name) VALUES (?, ?)', id, 'Usuário de teste');
}

export async function insertArea(id = AREA_ID): Promise<void> {
  await run(
    'INSERT INTO areas (id, key, name, source_id) VALUES (?, ?, ?, ?)',
    id,
    'finance',
    'Finanças',
    SOURCE_ID,
  );
}

export async function insertAudit(
  action = 'create',
  requestId: string | null = null,
): Promise<void> {
  await run(
    'INSERT INTO audit_log (entity_type, entity_id, action, actor_type, request_id) VALUES (?, ?, ?, ?, ?)',
    'area',
    AREA_ID,
    action,
    'system',
    requestId,
  );
}

export async function tableNames(): Promise<string[]> {
  const rows = await all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return rows.map((row) => row.name);
}

export async function indexNames(table: string): Promise<string[]> {
  const rows = await all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name NOT LIKE 'sqlite_%' ORDER BY name",
    table,
  );
  return rows.map((row) => row.name);
}

export async function queryPlan(sql: string, ...values: Binding[]): Promise<string> {
  const statement =
    values.length === 0
      ? testDb().prepare(`EXPLAIN QUERY PLAN ${sql}`)
      : testDb()
          .prepare(`EXPLAIN QUERY PLAN ${sql}`)
          .bind(...values);
  const rows = await statement.all<{ detail: string }>();
  return rows.results.map((row) => row.detail).join('\n');
}
