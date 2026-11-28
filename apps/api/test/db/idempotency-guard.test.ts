import { beforeEach, describe, expect, it } from 'vitest';
import {
  batchSql,
  createDb,
  insertOperationResultStatement,
  reserveIdempotencyStatement,
} from '@personal-os/db';
import {
  all,
  applyCoreSchema,
  applyDecisionSchema,
  applyIdempotencyGuardMigration,
  applyIndexAlignmentMigration,
  executeSql,
  resetDatabase,
  testDb,
} from './helpers';
import seedSql from '../../../../packages/db/src/seed.sql?raw';

const KEY = 'guarda-idempotencia';
const OP_ID = '0193a4c0-0000-7000-8000-0000000000a1';
const HASH = 'a'.repeat(64);

async function seedReservations(): Promise<void> {
  await batchSql(createDb(testDb()), [
    reserveIdempotencyStatement({
      key: KEY,
      opId: OP_ID,
      requestHash: HASH,
      createdAt: '2026-11-23T00:00:00.000Z',
    }),
    insertOperationResultStatement({
      key: KEY,
      opId: OP_ID,
      requestHash: HASH,
      statusCode: 201,
      bodyJson: JSON.stringify({ data: { id: 'original' } }),
    }),
  ]);
}

describe('guarda anti-REPLACE de reservas e resultados', () => {
  beforeEach(async () => {
    await resetDatabase();
    await applyCoreSchema();
    await executeSql(seedSql);
    await applyIdempotencyGuardMigration();
  });

  it('rejeita INSERT OR REPLACE em reserva e resultado', async () => {
    await seedReservations();

    await expect(
      testDb()
        .prepare(
          'INSERT OR REPLACE INTO idempotency_key_reservations (key, operation_id, request_hash) VALUES (?, ?, ?)',
        )
        .bind(KEY, '0193a4c0-0000-7000-8000-0000000000b2', HASH)
        .run(),
    ).rejects.toThrow(/append-only/);

    await expect(
      testDb()
        .prepare(
          'INSERT OR REPLACE INTO operation_results (key, operation_id, request_hash, status_code, body_json) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(KEY, OP_ID, HASH, 200, JSON.stringify({ data: { id: 'substituido' } }))
        .run(),
    ).rejects.toThrow(/append-only/);
  });

  it('preserva a primeira gravação em repetição legítima e com payload divergente', async () => {
    await seedReservations();
    const otherHash = 'b'.repeat(64);

    await batchSql(createDb(testDb()), [
      reserveIdempotencyStatement({
        key: KEY,
        opId: '0193a4c0-0000-7000-8000-0000000000c3',
        requestHash: otherHash,
        createdAt: '2026-11-24T00:00:00.000Z',
      }),
      insertOperationResultStatement({
        key: KEY,
        opId: OP_ID,
        requestHash: otherHash,
        statusCode: 500,
        bodyJson: JSON.stringify({ data: { id: 'divergente' } }),
      }),
    ]);

    const reservations = await all<{ operation_id: string; request_hash: string }>(
      'SELECT operation_id, request_hash FROM idempotency_key_reservations WHERE key = ?',
      KEY,
    );
    const results = await all<{ operation_id: string; status_code: number; body_json: string }>(
      'SELECT operation_id, status_code, body_json FROM operation_results WHERE key = ?',
      KEY,
    );

    expect(reservations).toEqual([{ operation_id: OP_ID, request_hash: HASH }]);
    expect(results).toEqual([
      {
        operation_id: OP_ID,
        status_code: 201,
        body_json: JSON.stringify({ data: { id: 'original' } }),
      },
    ]);
  });

  it('instala do zero e em upgrade sem perder linhas existentes', async () => {
    await resetDatabase();
    await applyDecisionSchema();
    await executeSql(seedSql);
    await seedReservations();
    const before = await all<{ key: string }>(
      'SELECT key FROM operation_results WHERE key = ?',
      KEY,
    );
    expect(before).toHaveLength(1);

    await applyIndexAlignmentMigration();
    await applyIdempotencyGuardMigration();

    const triggers = await all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name",
    );
    expect(triggers.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'idempotency_key_reservations_no_replace',
        'operation_results_no_replace',
      ]),
    );
    expect(await all<{ key: string }>('SELECT key FROM operation_results')).toHaveLength(1);
    await expect(
      testDb().prepare('DELETE FROM operation_results WHERE key = ?').bind(KEY).run(),
    ).rejects.toThrow(/append-only/);
  });
});
