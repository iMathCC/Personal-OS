import { useEffect, useState } from 'react';
import type {
  CreateStrategicAreaRequest,
  CreateStrategicGoalRequest,
  CreateVisionRequest,
  UpdateStrategicAreaRequest,
  UpdateVisionRequest,
} from '@personal-os/shared';
import { Link } from 'react-router';
import { ErrorPanel } from '@/components/states';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { planningApi } from '@/lib/api';
import { FIELD_CLASS, TEXTAREA_CLASS } from './fields';
import { arrayToLines, formatDate, linesToArray, statusLabel } from './format';
import { PageHeader, ResourceView } from './ui';
import { failureMessage, newIdempotencyKey, usePlanningDashboard } from './use-planning';

interface VisionForm {
  statement: string;
  horizonYears: string;
  principles: string;
  outcomes: string;
  changeNote: string;
}

const EMPTY_VISION: VisionForm = {
  statement: '',
  horizonYears: '',
  principles: '',
  outcomes: '',
  changeNote: '',
};

export function StrategyPage() {
  const dashboard = usePlanningDashboard();
  const [vision, setVision] = useState<VisionForm>(EMPTY_VISION);
  const [areaId, setAreaId] = useState('');
  const [areaImportance, setAreaImportance] = useState(3);
  const [goalId, setGoalId] = useState('');
  const [goalImportance, setGoalImportance] = useState(3);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- sincroniza formulário com dado externo recém-carregado */
  useEffect(() => {
    const active = dashboard.data?.vision;
    setVision(
      active === null || active === undefined
        ? EMPTY_VISION
        : {
            statement: active.statement ?? '',
            horizonYears: active.horizonYears === null ? '' : String(active.horizonYears),
            principles: arrayToLines(active.principles),
            outcomes: arrayToLines(active.desiredOutcomes),
            changeNote: '',
          },
    );
  }, [dashboard.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function visionBase(): CreateVisionRequest {
    return {
      ...(vision.statement.trim() === ''
        ? { statement: null }
        : { statement: vision.statement.trim() }),
      ...(vision.horizonYears === ''
        ? { horizonYears: null }
        : { horizonYears: Number(vision.horizonYears) }),
      principles: linesToArray(vision.principles),
      desiredOutcomes: linesToArray(vision.outcomes),
    };
  }

  function visionUpdatePayload(): UpdateVisionRequest {
    const base = visionBase();
    if (vision.changeNote.trim() === '') return base;
    return { ...base, changeNote: vision.changeNote.trim() };
  }

  async function saveVision(): Promise<void> {
    const active = dashboard.data?.vision ?? null;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (active === null) {
        await planningApi.createVision(visionBase(), newIdempotencyKey());
        setMessage('Visão registrada como versão ativa.');
      } else {
        await planningApi.updateVision(
          active.id,
          visionUpdatePayload(),
          newIdempotencyKey(),
          active.version,
        );
        setMessage('Nova versão da visão registrada; a anterior foi preservada.');
      }
      dashboard.reload();
    } catch (cause: unknown) {
      setError(failureMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function configureArea(): Promise<void> {
    if (areaId === '') return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const existing = dashboard.data?.areas.find((area) => area.areaId === areaId);
      if (existing === undefined) {
        const body: CreateStrategicAreaRequest = { areaId, importance: areaImportance };
        await planningApi.createArea(body, newIdempotencyKey());
      } else {
        const body: UpdateStrategicAreaRequest = { importance: areaImportance };
        await planningApi.updateArea(areaId, body, newIdempotencyKey(), existing.version);
      }
      setMessage('Área estratégica atualizada.');
      dashboard.reload();
    } catch (cause: unknown) {
      setError(failureMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function addStrategicGoal(): Promise<void> {
    if (goalId === '') return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const body: CreateStrategicGoalRequest = {
        goalId,
        ...(dashboard.data?.vision === null ? {} : { visionId: dashboard.data?.vision.id }),
        importance: goalImportance,
      };
      await planningApi.createStrategicGoal(body, newIdempotencyKey());
      setMessage('Meta vinculada à camada estratégica.');
      setGoalId('');
      dashboard.reload();
    } catch (cause: unknown) {
      setError(failureMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          eyebrow="Estratégia de vida"
          title="Visão, princípios e áreas"
          description="A visão é versionada: cada edição cria uma versão nova e preserva a anterior. Objetivos estratégicos reaproveitam metas e áreas já registradas — nada é pré-preenchido."
        />
        <Link
          to="/planejamento"
          className="inline-flex min-h-11 items-center gap-2 text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          Abrir Planejamento
          <Icon name="arrow" size={15} />
        </Link>
      </div>

      {message !== null && (
        <p role="status" className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
          {message}
        </p>
      )}
      {error !== null && <ErrorPanel title="Não foi possível salvar" message={error} />}

      <ResourceView state={dashboard}>
        {(data) => (
          <>
            <section
              aria-label="Visão de vida"
              className="rounded-xl border border-border bg-card p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold">
                  {data.vision === null
                    ? 'Registrar visão'
                    : `Visão — versão ${data.vision.version}`}
                </h3>
                {data.vision !== null && (
                  <span className="text-xs text-muted-foreground">
                    {statusLabel(data.vision.status)} · {formatDate(data.vision.createdAt)}
                  </span>
                )}
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <label className="text-sm">
                  Declaração de visão
                  <textarea
                    className={TEXTAREA_CLASS}
                    value={vision.statement}
                    onChange={(event) => setVision({ ...vision, statement: event.target.value })}
                    placeholder="Escreva a visão com suas próprias palavras."
                  />
                </label>
                <div className="space-y-4">
                  <label className="block text-sm">
                    Horizonte (anos)
                    <input
                      className={FIELD_CLASS}
                      type="number"
                      min={1}
                      max={50}
                      value={vision.horizonYears}
                      onChange={(event) =>
                        setVision({ ...vision, horizonYears: event.target.value })
                      }
                    />
                  </label>
                  <label className="block text-sm">
                    Nota da alteração (opcional)
                    <input
                      className={FIELD_CLASS}
                      value={vision.changeNote}
                      onChange={(event) => setVision({ ...vision, changeNote: event.target.value })}
                    />
                  </label>
                </div>
                <label className="text-sm">
                  Princípios (um por linha)
                  <textarea
                    className={TEXTAREA_CLASS}
                    value={vision.principles}
                    onChange={(event) => setVision({ ...vision, principles: event.target.value })}
                  />
                </label>
                <label className="text-sm">
                  Resultados desejados (um por linha)
                  <textarea
                    className={TEXTAREA_CLASS}
                    value={vision.outcomes}
                    onChange={(event) => setVision({ ...vision, outcomes: event.target.value })}
                  />
                </label>
              </div>
              <Button
                type="button"
                className="mt-4 min-h-11"
                onClick={() => void saveVision()}
                disabled={busy}
              >
                {data.vision === null ? 'Salvar visão' : 'Salvar nova versão'}
              </Button>
            </section>

            <section
              aria-label="Áreas estratégicas"
              className="rounded-xl border border-border bg-card p-5"
            >
              <h3 className="text-base font-semibold">Áreas da vida</h3>
              {data.areas.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Nenhuma área configurada. Selecione uma área existente para começar.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-border text-sm">
                  {data.areas.map((area) => (
                    <li key={area.areaId} className="flex justify-between gap-4 py-2">
                      <span>{area.name}</span>
                      <span className="text-muted-foreground">
                        importância {area.importance} · {area.activeGoalCount} meta(s) ativa(s)
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  Área existente
                  <select
                    className={FIELD_CLASS}
                    value={areaId}
                    onChange={(event) => setAreaId(event.target.value)}
                  >
                    <option value="">Selecione…</option>
                    {data.availableAreas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Importância (1–5)
                  <input
                    className={FIELD_CLASS}
                    type="number"
                    min={1}
                    max={5}
                    value={areaImportance}
                    onChange={(event) => setAreaImportance(Number(event.target.value))}
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => void configureArea()}
                  disabled={busy || areaId === ''}
                >
                  Configurar área
                </Button>
              </div>
            </section>

            <section
              aria-label="Metas estratégicas"
              className="rounded-xl border border-border bg-card p-5"
            >
              <h3 className="text-base font-semibold">Metas estratégicas</h3>
              <ul className="mt-3 divide-y divide-border text-sm">
                {data.strategicGoals.map((goal) => (
                  <li key={goal.goalId} className="flex justify-between gap-4 py-2">
                    <span>{goal.title}</span>
                    <span className="text-muted-foreground">
                      importância {goal.importance} · horizonte {goal.horizon}
                    </span>
                  </li>
                ))}
              </ul>
              {data.strategicGoals.length === 0 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Nenhuma meta vinculada. Use uma meta já existente.
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  Meta existente
                  <select
                    className={FIELD_CLASS}
                    value={goalId}
                    onChange={(event) => setGoalId(event.target.value)}
                  >
                    <option value="">Selecione…</option>
                    {data.availableGoals
                      .filter(
                        (goal) =>
                          !data.strategicGoals.some((strategic) => strategic.goalId === goal.id),
                      )
                      .map((goal) => (
                        <option key={goal.id} value={goal.id}>
                          {goal.title}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="text-sm">
                  Importância (1–5)
                  <input
                    className={FIELD_CLASS}
                    type="number"
                    min={1}
                    max={5}
                    value={goalImportance}
                    onChange={(event) => setGoalImportance(Number(event.target.value))}
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => void addStrategicGoal()}
                  disabled={busy || goalId === ''}
                >
                  Vincular meta
                </Button>
              </div>
            </section>
          </>
        )}
      </ResourceView>
    </div>
  );
}
