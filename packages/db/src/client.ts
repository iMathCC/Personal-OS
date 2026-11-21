import { type SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { SQLiteAsyncDialect } from 'drizzle-orm/sqlite-core';
import * as schema from './schema';

const dialect = new SQLiteAsyncDialect();

export function createDb(database: D1Database) {
  return drizzle(database, { schema });
}

export type Database = ReturnType<typeof createDb>;

/**
 * Executa statements `sql` puros no `batch()` nativo do D1.
 *
 * O `batch()` do Drizzle só aceita queries do query builder (elas implementam
 * `_prepare`), enquanto guards como `INSERT ... SELECT ... WHERE changes()=1`
 * precisam de SQL explícito. O dialeto converte cada statement para SQL + binds
 * e o D1 executa todos em uma única transação atômica.
 */
export async function batchSql(db: Database, statements: readonly SQL[]): Promise<unknown[]> {
  const client = db.$client;
  const prepared = statements.map((statement) => {
    const query = dialect.sqlToQuery(statement);
    return client.prepare(query.sql).bind(...query.params);
  });
  return client.batch(prepared);
}
