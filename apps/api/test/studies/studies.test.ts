import seedSql from '../../../../packages/db/src/seed.sql?raw';
import { beforeEach, describe, expect, it } from 'vitest';
import { all, applyCoreSchema, executeSql, resetDatabase, run } from '../db/helpers';
import { bodyOf, newClient, performSetup, type Client } from '../auth/helpers';

const STARTED_AT = '2026-11-21T02:30:00.000Z';
const KEY = 'curso-teste-001';

interface Envelope<T> {
  data: T;
  meta: { requestId: string; nextCursor?: string; hasMore?: boolean };
}

interface SessionDto {
  id: string;
  courseId: string | null;
  topic: string;
  startedAt: string;
  localDate: string;
  timezone: string;
  durationMinutes: number;
  unitsCompleted: number | null;
  version: number;
}

const sessionPayload = (overrides: Partial<Record<string, unknown>> = {}) => ({
  topic: 'Revisão de algoritmos',
  startedAt: STARTED_AT,
  timezone: 'America/Sao_Paulo',
  durationMinutes: 45,
  ...overrides,
});

async function createSession(
  client: Client,
  key: string,
  overrides: Partial<Record<string, unknown>> = {},
) {
  return client.request('/studies/sessions', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    json: sessionPayload(overrides),
  });
}

describe('vertical slice de estudos', () => {
  let client: Client;

  beforeEach(async () => {
    await resetDatabase();
    await applyCoreSchema();
    await executeSql(seedSql);
    const setup = await performSetup();
    client = setup.client;
  });

  it('cria curso e sessão com observação derivada, evento tipado e auditoria atômica', async () => {
    const courseResponse = await client.request('/studies/courses', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'curso-criado-1' },
      json: { title: 'Algoritmos', provider: 'Curso X', status: 'active' },
    });
    expect(courseResponse.status).toBe(201);
    const course = (await bodyOf<Envelope<{ id: string }>>(courseResponse)).data;

    const secretNote = 'anotação particular que não deve entrar na auditoria';
    const response = await createSession(client, KEY, {
      courseId: course.id,
      notes: secretNote,
    });
    expect(response.status).toBe(201);
    const session = (await bodyOf<Envelope<SessionDto>>(response)).data;

    expect(session.localDate).toBe('2026-11-20');
    expect(session.timezone).toBe('America/Sao_Paulo');
    expect(session.courseId).toBe(course.id);

    const observations = await all<{
      value_num: number;
      source_id: string;
      algorithm_version: string;
      study_session_id: string;
      local_date: string;
      timezone: string;
    }>('SELECT * FROM metric_observations WHERE study_session_id = ?', session.id);
    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      value_num: 45,
      source_id: 'src_calculation',
      algorithm_version: 'study-minutes-v1',
      local_date: '2026-11-20',
      timezone: 'America/Sao_Paulo',
    });

    const events = await all<{ area_id: string; course_id: string; study_session_id: string }>(
      'SELECT area_id, course_id, study_session_id FROM events WHERE study_session_id = ?',
      session.id,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.course_id).toBe(course.id);
    expect(events[0]?.study_session_id).toBe(session.id);

    const audits = await all<{ entity_type: string; action: string; after_json: string }>(
      "SELECT entity_type, action, after_json FROM audit_log WHERE action = 'create' ORDER BY id",
    );
    expect(audits.map((row) => row.entity_type)).toEqual(
      expect.arrayContaining(['course', 'study_session', 'metric_observation', 'event']),
    );
    const sessionAudit = audits.find((row) => row.entity_type === 'study_session');
    expect(sessionAudit?.after_json).toContain('"courseId"');
    expect(sessionAudit?.after_json).toContain('"unitsCompleted":null');
    expect(sessionAudit?.after_json).not.toContain(secretNote);
  });

  it('devolve o resultado original na repetição da mesma chave, sem segunda mutação', async () => {
    const first = await createSession(client, KEY);
    expect(first.status).toBe(201);
    const firstBody = await first.text();
    expect(first.headers.get('Idempotent-Replayed')).toBeNull();

    const second = await createSession(client, KEY);
    expect(second.status).toBe(201);
    expect(second.headers.get('Idempotent-Replayed')).toBe('true');
    expect(await second.text()).toBe(firstBody);

    const sessions = await all<{ id: string }>('SELECT id FROM study_sessions');
    const observations = await all<{ id: string }>('SELECT id FROM metric_observations');
    const events = await all<{ id: string }>('SELECT id FROM events');
    expect(sessions).toHaveLength(1);
    expect(observations).toHaveLength(1);
    expect(events).toHaveLength(1);

    const results = await all<{ status_code: number }>('SELECT status_code FROM operation_results');
    expect(results).toHaveLength(1);
    expect(results[0]?.status_code).toBe(201);
  });

  it('rejeita a mesma chave com payload diferente com 409', async () => {
    expect((await createSession(client, KEY)).status).toBe(201);
    const conflictResponse = await createSession(client, KEY, { topic: 'Outro tópico' });
    expect(conflictResponse.status).toBe(409);
    expect(await all<{ id: string }>('SELECT id FROM study_sessions')).toHaveLength(1);
  });

  it('garante uma única mutação sob requisições concorrentes com a mesma chave', async () => {
    const responses = await Promise.all([
      createSession(client, 'concorrente'),
      createSession(client, 'concorrente'),
      createSession(client, 'concorrente'),
    ]);
    expect(responses.map((response) => response.status)).toEqual([201, 201, 201]);
    const bodies = await Promise.all(responses.map((response) => response.text()));
    expect(new Set(bodies).size).toBe(1);

    expect(await all<{ id: string }>('SELECT id FROM study_sessions')).toHaveLength(1);
    expect(await all<{ id: string }>('SELECT id FROM metric_observations')).toHaveLength(1);
    expect(await all<{ id: string }>('SELECT id FROM events')).toHaveLength(1);
    expect(
      await all<{ id: string }>("SELECT id FROM audit_log WHERE entity_type = 'study_session'"),
    ).toHaveLength(1);
  });

  it('continua recuperando o resultado após limpeza da chave operacional', async () => {
    const first = await createSession(client, KEY);
    const original = await first.text();
    await run('DELETE FROM idempotency_keys');

    const replay = await createSession(client, KEY);
    expect(replay.status).toBe(201);
    expect(replay.headers.get('Idempotent-Replayed')).toBe('true');
    expect(await replay.text()).toBe(original);
    expect(await all<{ id: string }>('SELECT id FROM study_sessions')).toHaveLength(1);

    await expect(run('DELETE FROM operation_results')).rejects.toThrow(/append-only/);
  });

  it('não grava mutação nem auditoria quando a FK do curso é inválida', async () => {
    const response = await createSession(client, 'fk-invalida', { courseId: 'curso-inexistente' });
    expect(response.status).toBe(404);
    expect(await all<{ id: string }>('SELECT id FROM study_sessions')).toEqual([]);
    expect(
      await all<{ id: string }>("SELECT id FROM audit_log WHERE entity_type = 'study_session'"),
    ).toEqual([]);
    // A validação ocorre antes da reserva: nada é persistido em caso de erro.
    expect(await all<{ key: string }>('SELECT key FROM idempotency_key_reservations')).toEqual([]);
  });

  it('corrige observação preservando o original e registrando auditoria da troca', async () => {
    const session = (await bodyOf<Envelope<SessionDto>>(await createSession(client, KEY))).data;
    const observation = (await all<{ id: string }>('SELECT id FROM metric_observations'))[0]!;

    const response = await client.request(`/studies/observations/${observation.id}/supersede`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'correcao-1' },
      json: { valueNum: 60, reason: 'correção do cronômetro' },
    });
    expect(response.status).toBe(200);

    const rows = await all<{
      id: string;
      value_num: number;
      superseded_by: string | null;
      source_id: string;
    }>(
      'SELECT id, value_num, superseded_by, source_id FROM metric_observations ORDER BY created_at, id',
    );
    expect(rows).toHaveLength(2);
    const originalRow = rows.find((row) => row.id === observation.id)!;
    expect(originalRow.value_num).toBe(45);
    expect(originalRow.superseded_by).not.toBeNull();
    expect(originalRow.source_id).toBe('src_calculation');
    const replacement = rows.find((row) => row.id !== observation.id)!;
    expect(replacement.value_num).toBe(60);
    expect(replacement.source_id).toBe('src_manual');

    const updateAudit = await all<{ before_json: string; after_json: string }>(
      "SELECT before_json, after_json FROM audit_log WHERE entity_type = 'metric_observation' AND action = 'update'",
    );
    expect(updateAudit).toHaveLength(1);
    expect(updateAudit[0]?.before_json).toContain('"supersededBy":null');
    expect(updateAudit[0]?.after_json).not.toContain('correção do cronômetro');
    expect(session.durationMinutes).toBe(45);
  });

  it('exclui logicamente a sessão, preservando-a para o histórico', async () => {
    const session = (await bodyOf<Envelope<SessionDto>>(await createSession(client, KEY))).data;

    const response = await client.request(`/studies/sessions/${session.id}`, {
      method: 'DELETE',
      headers: { 'Idempotency-Key': 'exclusao-1', 'If-Match': '1' },
    });
    expect(response.status).toBe(200);
    const body = await bodyOf<Envelope<{ deleted: boolean; version: number }>>(response);
    expect(body.data).toMatchObject({ deleted: true, version: 2 });

    const stored = await all<{ deleted_at: string | null; version: number }>(
      'SELECT deleted_at, version FROM study_sessions WHERE id = ?',
      session.id,
    );
    expect(stored[0]?.deleted_at).not.toBeNull();
    expect(stored[0]?.version).toBe(2);

    const list = await bodyOf<Envelope<SessionDto[]>>(await client.request('/studies/sessions'));
    expect(list.data).toHaveLength(0);
  });

  it('expõe série e dashboard com valores reais e lacunas explícitas', async () => {
    await createSession(client, 'serie-1', { startedAt: '2026-11-18T12:30:00.000Z' });
    await createSession(client, 'serie-2', {
      startedAt: '2026-11-20T12:30:00.000Z',
      durationMinutes: 30,
    });

    const series = await bodyOf<
      Envelope<{
        metricKey: string;
        granularity: string;
        points: Array<{ date: string; value: number | null; sampleCount: number }>;
      }>
    >(await client.request('/studies/series?from=2026-11-18&to=2026-11-20&granularity=day'));
    expect(series.data.metricKey).toBe('study_minutes');
    expect(series.data.points).toEqual([
      { date: '2026-11-18', value: 45, sampleCount: 1 },
      { date: '2026-11-19', value: null, sampleCount: 0 },
      { date: '2026-11-20', value: 30, sampleCount: 1 },
    ]);

    const dashboard = await bodyOf<
      Envelope<{ summary: { totalMinutes: number; daysStudied: number } }>
    >(await client.request('/studies/dashboard?from=2026-11-18&to=2026-11-20'));
    expect(dashboard.data.summary).toMatchObject({ totalMinutes: 75, daysStudied: 2 });
  });

  it('exige sessão e valida entrada', async () => {
    const anonymous = await newClient();
    expect((await anonymous.request('/studies/sessions')).status).toBe(401);

    const invalid = await client.request('/studies/sessions', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'invalida' },
      json: sessionPayload({ durationMinutes: -1 }),
    });
    expect(invalid.status).toBe(400);

    const missingKey = await client.request('/studies/sessions', {
      method: 'POST',
      json: sessionPayload(),
    });
    expect(missingKey.status).toBe(400);
  });
});
