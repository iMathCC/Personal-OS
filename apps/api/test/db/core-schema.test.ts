import { beforeEach, describe, expect, it } from 'vitest';
import seedSql from '../../../../packages/db/src/seed.sql?raw';
import {
  all,
  applyCoreMigration,
  applyCoreSchema,
  applyFullSchema,
  executeSql,
  first,
  indexNames,
  resetDatabase,
  run,
  tableNames,
} from './helpers';

const CORE_TABLES = [
  'courses',
  'events',
  'goal_metrics',
  'goals',
  'idempotency_key_reservations',
  'metric_observations',
  'metrics',
  'operation_results',
  'study_sessions',
];

const METRIC_ID = '0193a4b0-0000-7000-8000-000000000001';
const STUDIES_AREA_ID = '01a1fb52-074d-7043-a390-78a0731bdb52';
const SESSION_ID = '0193a4c0-0000-7000-8000-000000000001';
const OBSERVATION_ID = '0193a4c0-0000-7000-8000-000000000002';

describe('migração 0003 — modelo central e estudos', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('instala em banco vazio e cria índices em todas as FKs novas', async () => {
    await applyCoreSchema();

    const tables = new Set(await tableNames());
    for (const table of CORE_TABLES) expect(tables.has(table)).toBe(true);

    expect(await indexNames('metric_observations')).toEqual(
      expect.arrayContaining([
        'idx_obs_metric_time',
        'idx_obs_metric_date',
        'idx_obs_source',
        'idx_obs_superseded',
        'idx_obs_session',
        'idx_obs_course',
        'idx_obs_active_metric_date',
      ]),
    );
    expect(await indexNames('study_sessions')).toEqual(
      expect.arrayContaining(['idx_study_date', 'idx_study_course', 'idx_study_source']),
    );
    expect(await indexNames('events')).toEqual(
      expect.arrayContaining([
        'idx_events_date',
        'idx_events_area_date',
        'idx_events_course',
        'idx_events_session',
      ]),
    );
    expect(await indexNames('operation_results')).toContain('idx_operation_results_op');
  });

  it('faz upgrade preservando usuários, passkeys, sessões e auditoria existentes', async () => {
    await applyFullSchema();
    await run('INSERT INTO users (id, display_name) VALUES (?, ?)', 'u-1', 'Usuário existente');
    await run(
      'INSERT INTO passkeys (id, user_id, public_key, name) VALUES (?, ?, ?, ?)',
      'pk-1',
      'u-1',
      'pub',
      'Passkey',
    );
    await run(
      'INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      's-1',
      'u-1',
      'hash',
      '2099-01-01T00:00:00.000Z',
    );
    await run(
      'INSERT INTO audit_log (entity_type, entity_id, action, actor_type) VALUES (?, ?, ?, ?)',
      'user',
      'u-1',
      'setup',
      'system',
    );

    await applyCoreMigration();
    await executeSql(seedSql);

    expect(
      await first<{ display_name: string }>('SELECT display_name FROM users WHERE id = ?', 'u-1'),
    ).toEqual({
      display_name: 'Usuário existente',
    });
    expect(await all<{ id: string }>('SELECT id FROM passkeys')).toEqual([{ id: 'pk-1' }]);
    expect(await all<{ id: string }>('SELECT id FROM sessions')).toEqual([{ id: 's-1' }]);
    expect(await all<{ id: number }>('SELECT id FROM audit_log')).toHaveLength(1);
    expect(await all<{ key: string }>('SELECT key FROM metrics')).toEqual([
      { key: 'study_minutes' },
    ]);
  });

  it('aplica seeds idempotentes com a métrica canônica', async () => {
    await applyCoreSchema();
    await executeSql(seedSql);
    await executeSql(seedSql);

    expect(await all<{ id: string }>('SELECT id FROM metrics')).toEqual([{ id: METRIC_ID }]);
    const metric = await first<{ area_id: string; source_id: string; algorithm: string }>(
      'SELECT area_id, source_id, aggregation AS algorithm FROM metrics WHERE id = ?',
      METRIC_ID,
    );
    expect(metric.area_id).toBe(STUDIES_AREA_ID);
    expect(metric.source_id).toBe('src_calculation');
    expect(metric.algorithm).toBe('sum');
  });

  it('rejeita FK inválida e não deixa mutação parcial', async () => {
    await applyCoreSchema();
    await executeSql(seedSql);

    await expect(
      run(
        'INSERT INTO study_sessions (id, course_id, topic, started_at, local_date, timezone, duration_minutes, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        SESSION_ID,
        'curso-inexistente',
        'Revisão',
        '2026-11-21T12:00:00.000Z',
        '2026-11-21',
        'America/Sao_Paulo',
        30,
        'src_manual',
      ),
    ).rejects.toThrow();

    expect(await all<{ id: string }>('SELECT id FROM study_sessions')).toEqual([]);
  });

  it('exige algoritmo quando a origem é cálculo e valor único na observação', async () => {
    await applyCoreSchema();
    await executeSql(seedSql);

    await expect(
      run(
        'INSERT INTO metric_observations (id, metric_id, observed_at, local_date, timezone, value_num, source_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        OBSERVATION_ID,
        METRIC_ID,
        '2026-11-21T12:00:00.000Z',
        '2026-11-21',
        'America/Sao_Paulo',
        30,
        'src_calculation',
      ),
    ).rejects.toThrow(/algorithm_version|CHECK constraint/i);

    await run(
      'INSERT INTO metric_observations (id, metric_id, observed_at, local_date, timezone, value_num, source_id, algorithm_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      OBSERVATION_ID,
      METRIC_ID,
      '2026-11-21T12:00:00.000Z',
      '2026-11-21',
      'America/Sao_Paulo',
      30,
      'src_calculation',
      'study-minutes-v1',
    );
    expect(await all<{ id: string }>('SELECT id FROM metric_observations')).toHaveLength(1);
  });

  it('impede alteração de valor observado e preserva a correção por superseded_by', async () => {
    await applyCoreSchema();
    await executeSql(seedSql);
    await run(
      'INSERT INTO metric_observations (id, metric_id, observed_at, local_date, timezone, value_num, source_id, algorithm_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      OBSERVATION_ID,
      METRIC_ID,
      '2026-11-21T12:00:00.000Z',
      '2026-11-21',
      'America/Sao_Paulo',
      30,
      'src_calculation',
      'study-minutes-v1',
    );

    await expect(
      run('UPDATE metric_observations SET value_num = ? WHERE id = ?', 45, OBSERVATION_ID),
    ).rejects.toThrow(/immutable/i);

    const correctionId = '0193a4c0-0000-7000-8000-000000000003';
    await run(
      'INSERT INTO metric_observations (id, metric_id, observed_at, local_date, timezone, value_num, source_id, algorithm_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      correctionId,
      METRIC_ID,
      '2026-11-21T12:00:00.000Z',
      '2026-11-21',
      'America/Sao_Paulo',
      45,
      'src_calculation',
      'study-minutes-v1',
    );
    await run(
      'UPDATE metric_observations SET superseded_by = ? WHERE id = ?',
      correctionId,
      OBSERVATION_ID,
    );

    const rows = await all<{ id: string; value_num: number; superseded_by: string | null }>(
      'SELECT id, value_num, superseded_by FROM metric_observations ORDER BY id',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.value_num).toBe(30);
    expect(rows[0]?.superseded_by).toBe(correctionId);
    expect(rows[1]?.superseded_by).toBeNull();
  });

  it('protege resultados e reservas contra UPDATE e DELETE', async () => {
    await applyCoreSchema();
    const key = 'v1|subject|POST|/api/v1/x|client';
    await run(
      'INSERT INTO idempotency_key_reservations (key, operation_id, request_hash) VALUES (?, ?, ?)',
      key,
      '0193a4c0-0000-7000-8000-000000000009',
      'a'.repeat(64),
    );
    await run(
      'INSERT INTO operation_results (key, operation_id, request_hash, status_code, body_json) VALUES (?, ?, ?, ?, ?)',
      key,
      '0193a4c0-0000-7000-8000-000000000009',
      'a'.repeat(64),
      200,
      '{"ok":true}',
    );

    await expect(
      run('DELETE FROM idempotency_key_reservations WHERE key = ?', key),
    ).rejects.toThrow(/append-only/);
    await expect(
      run('UPDATE operation_results SET status_code = ? WHERE key = ?', 500, key),
    ).rejects.toThrow(/append-only/);
  });
});
