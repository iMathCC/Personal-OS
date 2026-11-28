import seedSql from '../../../../packages/db/src/seed.sql?raw';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyObservationsSchema, executeSql, resetDatabase } from '../db/helpers';
import { bodyOf, performSetup, type Client } from '../auth/helpers';

interface Envelope<T> {
  data: T;
  meta: { requestId: string; nextCursor?: string; hasMore?: boolean; truncated?: boolean };
}

interface Obs {
  id: string;
  kind: string;
  title: string;
  status: string;
  localDate: string;
  confidence: number | null;
  version: number;
  supersededBy: string | null;
  correctsId: string | null;
  evidence: Array<{ type: string; id: string; label?: string }>;
  sourceId: string;
}

async function createObs(
  client: Client,
  key: string,
  overrides: Record<string, unknown> = {},
): Promise<Obs> {
  const res = await client.request('/observations', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    json: {
      kind: 'executed',
      title: `Obs ${key}`,
      observedAt: '2026-11-10T12:00:00.000Z',
      timezone: 'America/Sao_Paulo',
      content: 'conteúdo',
      ...overrides,
    },
  });
  expect(res.status).toBe(201);
  return (await bodyOf<Envelope<Obs>>(res)).data;
}

describe('Observações pessoais (D37)', () => {
  let client: Client;

  beforeEach(async () => {
    await resetDatabase();
    await applyObservationsSchema();
    await executeSql(seedSql);
    client = (await performSetup()).client;
  });

  it('registra observação com proveniência, auditoria e replay idempotente', async () => {
    const obs = await createObs(client, 'obs-create');
    expect(obs.sourceId).toBe('src_manual');
    expect(obs.status).toBe('active');
    expect(obs.kind).toBe('executed');

    const replay = await client.request('/observations', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'obs-create' },
      json: {
        kind: 'executed',
        title: 'Obs obs-create',
        observedAt: '2026-11-10T12:00:00.000Z',
        timezone: 'America/Sao_Paulo',
        content: 'conteúdo',
      },
    });
    expect(replay.status).toBe(201);
    expect(replay.headers.get('Idempotent-Replayed')).toBe('true');
  });

  it('lista histórico e filtra por período/tipo', async () => {
    await createObs(client, 'a', { kind: 'executed', observedAt: '2026-11-10T12:00:00.000Z' });
    await createObs(client, 'b', {
      kind: 'inference',
      confidence: 0.7,
      observedAt: '2026-11-11T12:00:00.000Z',
    });
    const list = await client.request('/observations?from=2026-11-10&to=2026-11-11');
    expect(list.status).toBe(200);
    const body = await bodyOf<Envelope<Obs[]>>(list);
    expect(body.data.length).toBe(2);
    const kinds = body.data.map((o) => o.kind).sort();
    expect(kinds).toEqual(['executed', 'inference']);
  });

  it('corrige observação preservando histórico (supersede)', async () => {
    const obs = await createObs(client, 'corr');
    const correct = await client.request(`/observations/${obs.id}/correct`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'corr-1', 'If-Match': `"${obs.version}"` },
      json: { title: 'Obs corrigida', reason: 'ajuste' },
    });
    expect(correct.status).toBe(200);
    const corrected = (await bodyOf<Envelope<Obs>>(correct)).data;
    expect(corrected.title).toBe('Obs corrigida');
    expect(corrected.correctsId).toBe(obs.id);

    const old = await client.request(`/observations/${obs.id}`);
    expect(old.status).toBe(200);
    const oldBody = (await bodyOf<Envelope<Obs>>(old)).data;
    expect(oldBody.status).toBe('superseded');
    expect(oldBody.supersededBy).toBe(corrected.id);
  });

  it('rejeita inferência sem confidence', async () => {
    const res = await client.request('/observations', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'bad-inference' },
      json: {
        kind: 'inference',
        title: 'Inferência inválida',
        observedAt: '2026-11-10T12:00:00.000Z',
        timezone: 'America/Sao_Paulo',
      },
    });
    expect(res.status).toBe(400);
  });

  it('summary reporta lacunas sem preencher zeros fictícios', async () => {
    await createObs(client, 's1', { observedAt: '2026-11-10T12:00:00.000Z' });
    const res = await client.request('/observations/summary?from=2026-11-10&to=2026-11-12');
    expect(res.status).toBe(200);
    const body = await bodyOf<
      Envelope<{
        coverage: {
          daysInRange: number;
          daysWithObservations: number;
          missingDays: number;
          coveragePercent: number | null;
        };
        limitations: string[];
        totalObservations: number;
      }>
    >(res);
    expect(body.data.totalObservations).toBe(1);
    expect(body.data.coverage.daysInRange).toBe(3);
    expect(body.data.coverage.daysWithObservations).toBe(1);
    expect(body.data.coverage.missingDays).toBe(2);
    expect(body.data.limitations.some((l) => /zero|imputação/i.test(l))).toBe(true);
  });

  it('duas correções concorrentes na mesma versão: apenas uma sucede', async () => {
    const obs = await createObs(client, 'race-base');
    const [r1, r2] = await Promise.all([
      client.request(`/observations/${obs.id}/correct`, {
        method: 'POST',
        headers: { 'Idempotency-Key': 'race-a', 'If-Match': `"${obs.version}"` },
        json: { title: 'Correção A' },
      }),
      client.request(`/observations/${obs.id}/correct`, {
        method: 'POST',
        headers: { 'Idempotency-Key': 'race-b', 'If-Match': `"${obs.version}"` },
        json: { title: 'Correção B' },
      }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);

    const old = await bodyOf<Envelope<Obs>>(await client.request(`/observations/${obs.id}`));
    expect(old.data.status).toBe('superseded');
    expect(old.data.supersededBy).toBeTruthy();

    const list = await bodyOf<Envelope<Obs[]>>(await client.request('/observations?status=active'));
    const activeCorrections = list.data.filter((o) => o.correctsId === obs.id);
    expect(activeCorrections).toHaveLength(1);
  });

  it('não corrige observação já supersedida/deletada', async () => {
    const obs = await createObs(client, 'sup-base');
    const first = await client.request(`/observations/${obs.id}/correct`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'sup-1', 'If-Match': `"${obs.version}"` },
      json: { title: 'Primeira correção' },
    });
    expect(first.status).toBe(200);

    const second = await client.request(`/observations/${obs.id}/correct`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'sup-2', 'If-Match': `"${obs.version}"` },
      json: { title: 'Segunda correção' },
    });
    expect(second.status).toBe(409);
  });
});
