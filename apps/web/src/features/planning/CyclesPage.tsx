import { useEffect, useState } from 'react';
import type {
  CreateCycleRequest,
  CreateQuarterlyReviewRequest,
  CycleTransitionRequest,
} from '@personal-os/shared';
import { ErrorPanel } from '@/components/states';
import { Button } from '@/components/ui/button';
import { planningApi } from '@/lib/api';
import { FIELD_CLASS, TEXTAREA_CLASS } from './fields';
import { formatDate, linesToArray, statusLabel } from './format';
import { PageHeader, ResourceView } from './ui';
import { failureMessage, newIdempotencyKey, usePlanningDashboard } from './use-planning';

interface CycleForm {
  name: string;
  startDate: string;
  endDate: string;
  theme: string;
  expectedResults: string;
  priorityProjects: string;
  successCriteria: string;
  goalIds: string;
  priorityGoalIds: string;
}

const EMPTY_CYCLE: CycleForm = {
  name: '',
  startDate: '',
  endDate: '',
  theme: '',
  expectedResults: '',
  priorityProjects: '',
  successCriteria: '',
  goalIds: '',
  priorityGoalIds: '',
};

interface ReflectionForm {
  planned: string;
  completed: string;
  results: string;
  changedGoals: string;
  pending: string;
  incorrectHypotheses: string;
  learned: string;
  keep: string;
  deferOrDrop: string;
  nextPriorities: string;
}

const EMPTY_REFLECTION: ReflectionForm = {
  planned: '',
  completed: '',
  results: '',
  changedGoals: '',
  pending: '',
  incorrectHypotheses: '',
  learned: '',
  keep: '',
  deferOrDrop: '',
  nextPriorities: '',
};

const REFLECTION_FIELDS: ReadonlyArray<readonly [keyof ReflectionForm, string]> = [
  ['planned', 'Planejado'],
  ['completed', 'Concluído'],
  ['results', 'Resultados'],
  ['changedGoals', 'Metas alteradas'],
  ['pending', 'Pendente'],
  ['incorrectHypotheses', 'Hipóteses incorretas'],
  ['learned', 'Aprendizado'],
  ['keep', 'Manter'],
  ['deferOrDrop', 'Adiar ou abandonar'],
  ['nextPriorities', 'Próximas prioridades'],
];

function cyclePayload(form: CycleForm): CreateCycleRequest {
  return {
    name: form.name.trim(),
    startDate: form.startDate,
    endDate: form.endDate,
    ...(form.theme.trim() === '' ? {} : { theme: form.theme.trim() }),
    expectedResults: linesToArray(form.expectedResults),
    priorityProjects: linesToArray(form.priorityProjects),
    successCriteria: linesToArray(form.successCriteria),
    goalIds: linesToArray(form.goalIds),
    priorityGoalIds: linesToArray(form.priorityGoalIds),
  };
}

export function CyclesPage() {
  const dashboard = usePlanningDashboard();
  const [form, setForm] = useState<CycleForm>(EMPTY_CYCLE);
  const [reviewCycleId, setReviewCycleId] = useState('');
  const [reflection, setReflection] = useState<ReflectionForm>(EMPTY_REFLECTION);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- carrega reflexões salvas ao trocar de ciclo */
  useEffect(() => {
    if (reviewCycleId === '') {
      setReflection(EMPTY_REFLECTION);
      return;
    }
    const saved = dashboard.data?.reviews.find((item) => item.cycleId === reviewCycleId);
    if (saved === undefined) {
      setReflection(EMPTY_REFLECTION);
      return;
    }
    const next = { ...EMPTY_REFLECTION };
    for (const [key] of REFLECTION_FIELDS) {
      next[key] = saved.reflections[key] ?? '';
    }
    setReflection(next);
  }, [reviewCycleId, dashboard.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function update(field: keyof CycleForm, value: string): void {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function createCycle(): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await planningApi.createCycle(cyclePayload(form), newIdempotencyKey());
      setForm(EMPTY_CYCLE);
      setMessage('Ciclo registrado.');
      dashboard.reload();
    } catch (cause: unknown) {
      setError(failureMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function updateCycle(
    id: string,
    version: number,
    status: 'active' | 'completed' | 'paused',
  ): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const body: CycleTransitionRequest = { status };
      await planningApi.transitionCycle(id, body, newIdempotencyKey(), version);
      setMessage(`Ciclo movido para ${statusLabel(status)}.`);
      dashboard.reload();
    } catch (cause: unknown) {
      setError(failureMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function reflectionPayload(): NonNullable<CreateQuarterlyReviewRequest['reflections']> {
    const result: NonNullable<CreateQuarterlyReviewRequest['reflections']> = {};
    for (const [key] of REFLECTION_FIELDS) {
      if (reflection[key].trim() !== '') result[key] = reflection[key].trim();
    }
    return result;
  }

  async function saveReview(): Promise<void> {
    if (reviewCycleId === '') return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const existing = dashboard.data?.reviews.find((item) => item.cycleId === reviewCycleId);
      if (existing === undefined) {
        await planningApi.saveReview(
          { cycleId: reviewCycleId, reflections: reflectionPayload() },
          newIdempotencyKey(),
        );
      } else {
        await planningApi.updateReview(
          reviewCycleId,
          { reflections: reflectionPayload() },
          newIdempotencyKey(),
          existing.version,
        );
      }
      setMessage('Revisão salva com snapshot congelado; o histórico foi preservado.');
      dashboard.reload();
    } catch (cause: unknown) {
      setError(failureMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const completedCycles = (dashboard.data?.cycles ?? []).filter(
    (cycle) => cycle.status === 'completed',
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Planejamento trimestral"
        title="Ciclos e revisão final"
        description="Cada ciclo registra tema, metas, resultados esperados e critérios de sucesso. Períodos inválidos ou sobrepostos são rejeitados pela API, e a revisão congela um snapshot sem recalcular o passado."
      />

      {message !== null && (
        <p role="status" className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
          {message}
        </p>
      )}
      {error !== null && <ErrorPanel title="Não foi possível concluir" message={error} />}

      <ResourceView state={dashboard}>
        {(data) => (
          <>
            <section
              aria-label="Ciclos registrados"
              className="rounded-xl border border-border bg-card p-5"
            >
              <h3 className="text-base font-semibold">Ciclos</h3>
              {data.cycles.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Nenhum ciclo registrado.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {data.cycles.map((cycle) => {
                    const review = data.reviews.find((item) => item.cycleId === cycle.id);
                    return (
                      <li key={cycle.id} className="rounded-lg border border-border p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{cycle.name}</p>
                          <span className="text-xs text-muted-foreground">
                            {statusLabel(cycle.status)} · v{cycle.version} ·{' '}
                            {formatDate(cycle.startDate)} – {formatDate(cycle.endDate)}
                          </span>
                        </div>
                        {cycle.theme !== null && (
                          <p className="mt-1 text-sm text-muted-foreground">Tema: {cycle.theme}</p>
                        )}
                        {cycle.objectives.length > 0 && (
                          <p className="mt-1 text-sm">
                            Objetivos:{' '}
                            {cycle.objectives
                              .map(
                                (item) => `${item.title}${item.isPriority ? ' (prioritário)' : ''}`,
                              )
                              .join(', ')}
                          </p>
                        )}
                        {cycle.expectedResults.length > 0 && (
                          <p className="mt-1 text-sm">
                            Resultados esperados: {cycle.expectedResults.join('; ')}
                          </p>
                        )}
                        {cycle.successCriteria.length > 0 && (
                          <p className="mt-1 text-sm">
                            Critérios de sucesso: {cycle.successCriteria.join('; ')}
                          </p>
                        )}
                        {review !== undefined && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Revisão {statusLabel(review.status)} v{review.version} — snapshot
                            congelado
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {cycle.status === 'planned' && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void updateCycle(cycle.id, cycle.version, 'active')}
                            >
                              Ativar
                            </Button>
                          )}
                          {cycle.status === 'active' && (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => void updateCycle(cycle.id, cycle.version, 'paused')}
                              >
                                Pausar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() =>
                                  void updateCycle(cycle.id, cycle.version, 'completed')
                                }
                              >
                                Concluir
                              </Button>
                            </>
                          )}
                          {cycle.status === 'paused' && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void updateCycle(cycle.id, cycle.version, 'active')}
                            >
                              Retomar
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section
              aria-label="Novo ciclo"
              className="rounded-xl border border-border bg-card p-5"
            >
              <h3 className="text-base font-semibold">Registrar ciclo</h3>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <label className="text-sm">
                  Nome
                  <input
                    className={FIELD_CLASS}
                    value={form.name}
                    onChange={(event) => update('name', event.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Tema (opcional)
                  <input
                    className={FIELD_CLASS}
                    value={form.theme}
                    onChange={(event) => update('theme', event.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Início
                  <input
                    className={FIELD_CLASS}
                    type="date"
                    value={form.startDate}
                    onChange={(event) => update('startDate', event.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Fim
                  <input
                    className={FIELD_CLASS}
                    type="date"
                    value={form.endDate}
                    onChange={(event) => update('endDate', event.target.value)}
                  />
                </label>
                <label className="text-sm">
                  IDs das metas (um por linha)
                  <textarea
                    className={TEXTAREA_CLASS}
                    value={form.goalIds}
                    onChange={(event) => update('goalIds', event.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Metas prioritárias (subset das anteriores)
                  <textarea
                    className={TEXTAREA_CLASS}
                    value={form.priorityGoalIds}
                    onChange={(event) => update('priorityGoalIds', event.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Resultados esperados (um por linha)
                  <textarea
                    className={TEXTAREA_CLASS}
                    value={form.expectedResults}
                    onChange={(event) => update('expectedResults', event.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Critérios de sucesso (um por linha)
                  <textarea
                    className={TEXTAREA_CLASS}
                    value={form.successCriteria}
                    onChange={(event) => update('successCriteria', event.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Projetos prioritários (IDs, um por linha)
                  <textarea
                    className={TEXTAREA_CLASS}
                    value={form.priorityProjects}
                    onChange={(event) => update('priorityProjects', event.target.value)}
                  />
                </label>
              </div>
              <Button
                type="button"
                className="mt-4 min-h-11"
                disabled={
                  busy || form.name.trim() === '' || form.startDate === '' || form.endDate === ''
                }
                onClick={() => void createCycle()}
              >
                Registrar ciclo
              </Button>
            </section>

            <section
              aria-label="Revisão trimestral"
              className="rounded-xl border border-border bg-card p-5"
            >
              <h3 className="text-base font-semibold">Revisão trimestral</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Reflexões são opcionais. A revisão só pode ser criada para ciclos concluídos.
              </p>
              <label className="mt-4 block text-sm">
                Ciclo concluído
                <select
                  className={FIELD_CLASS}
                  value={reviewCycleId}
                  onChange={(event) => setReviewCycleId(event.target.value)}
                >
                  <option value="">Selecione…</option>
                  {completedCycles.map((cycle) => (
                    <option key={cycle.id} value={cycle.id}>
                      {cycle.name}
                    </option>
                  ))}
                </select>
              </label>
              {reviewCycleId !== '' && (
                <>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {REFLECTION_FIELDS.map(([key, label]) => (
                      <label key={key} className="text-sm">
                        {label} (opcional)
                        <textarea
                          className={TEXTAREA_CLASS}
                          value={reflection[key]}
                          onChange={(event) =>
                            setReflection((current) => ({ ...current, [key]: event.target.value }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <Button
                    type="button"
                    className="mt-4 min-h-11"
                    disabled={busy}
                    onClick={() => void saveReview()}
                  >
                    Salvar revisão
                  </Button>
                  {data.reviews
                    .filter((item) => item.cycleId === reviewCycleId)
                    .map((item) => (
                      <div key={item.id} className="mt-4 rounded-lg border border-border p-4">
                        <p className="text-sm font-medium">
                          Snapshot congelado em {formatDate(item.createdAt.slice(0, 10))} · v
                          {item.version}
                        </p>
                        <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-3 text-xs">
                          {JSON.stringify(item.snapshot, null, 2)}
                        </pre>
                      </div>
                    ))}
                </>
              )}
            </section>
          </>
        )}
      </ResourceView>
    </div>
  );
}
