import { sql } from 'drizzle-orm';
import { text } from 'drizzle-orm/sqlite-core';

export function timestamp(name: string) {
  return (
    text(name)
      .notNull()
      // Parênteses são obrigatórios: o D1 rejeita chamadas de função diretas em DEFAULT.
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`)
  );
}

export function nullableTimestamp(name: string) {
  return text(name);
}
