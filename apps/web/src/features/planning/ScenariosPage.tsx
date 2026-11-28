import { useState } from 'react';
import type { ScenarioChangeDto, SimulateRequest } from '@personal-os/shared';
import { ErrorPanel } from '@/components/states';
import { Button } from '@/components/ui/button';
import { planningApi } from '@/lib/api';
import { FIELD_CLASS, TEXTAREA_CLASS } from './fields';
import { formatDate, formatMinutes } from './format';
import { PageHeader, ResourceView } from './ui';
import {
  failureMessage,
  newIdempotencyKey,
  usePlanningDashboard,
  usePlanningResource,
} from './use-planning';

const CHANGE_TYPES: ReadonlyArray<readonly [ScenarioChangeDto['type'], string]> = [
  ['set_goal_importance', 'Alterar importância da meta (1–5)'],
  ['set_capacity', 'Alterar capacidade semanal (minutos)'],
  ['defer_project', 'Adiar projeto'],
  ['set_area_focus', 'Alterar foco da área (0–100)'],
  ['exclude_task', 'Excluir tarefa da simulação'],
];

interface ChangeLine {
  type: ScenarioChangeDto['type'];
  goalId: string;
  projectId: string;
  taskId: string;
  areaId: string;
  value: string;
}

const EMPTY_CHANGE: ChangeLine = {
  type: 'set_capacity',
  goalId: '',
  projectId: '',
  taskId: '',
  areaId: '',
  value: '',
};

function changesPayload(lines: readonly ChangeLine[]): ScenarioChangeDto[] {
  return lines.map((line) => ({
    type: line.type,
    ...(line.goalId === '' ? {} : { goalId: line.goalId }),
    ...(line.projectId === '' ? {} : { projectId: line.projectId }),
    ...(line.taskId === '' ? {} : { taskId: line.taskId }),
    ...(line.areaId === '' ? {} : { areaId: line.areaId }),
    ...(line.value === '' ? {} : { value: Number(line.value) }),
  }));
}

export function ScenariosPage() {
  const dashboard = usePlanningDashboard();
  const scenarios = usePlanningResource((signal) => planningApi.scenarios(50, signal));
  const [weekStart, setWeekStart] = useState('');
  const [changes, setChanges] = useState<ChangeLine[]>([{ ...EMPTY_CHANGE }]);
  const [name, setName] = useState('');
  const [hypotheses, setHypotheses] = useState('');
  const [comparison, setComparison] = useState<Awaited<
    ReturnType<typeof planningApi.compare>
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function payload(): SimulateRequest {
    return {
      changes: changesPayload(changes),
      ...(weekStart === '' ? {} : { weekStart }),
    };
  }

  async function simulate(): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setComparison(await planningApi.compare(payload()));
    } catch (cause: unknown) {
      setError(failureMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<void> {
    if (name.trim() === '') return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await planningApi.createScenario(
        {
          name: name.trim(),
          ...(hypotheses.trim() === '' ? {} : { hypotheses: hypotheses.trim() }),
          changes: changesPayload(changes),
          ...(weekStart === '' ? {} : { weekStart }),
        },
        newIdempotencyKey(),
      );
      setMessage('Cenário salvo como hipótese; nenhum dado real foi alterado.');
      setName('');
      scenarios.reload();
      dashboard.reload();
    } catch (cause: unknown) {
      setError(failureMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function update(index: number, field: keyof ChangeLine, value: string): void {
    setChanges((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              [field]: field === 'type' ? (value as ScenarioChangeDto['type']) : value,
            }
          : line,
      ),
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Cenários"
        title="Simulações hipotéticas sem efeito real"
        description="O cenário copia o estado lógico, aplica apenas hipóteses explícitas e compara com a base. Metas, projetos, tarefas e observações reais nunca são alterados — nenhuma tarefa é executada."
      />

      {message !== null && (
        <p role="status" className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
          {message}
        </p>
      )}
      {error !== null && <ErrorPanel title="Não foi possível simular" message={error} />}

      <section aria-label="Hipóteses" className="rounded-xl border border-border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Semana de referência (opcional)
            <input
              className={FIELD_CLASS}
              type="date"
              value={weekStart}
              onChange={(event) => setWeekStart(event.target.value)}
            />
          </label>
          <label className="text-sm">
            Nome para salvar (opcional para simular)
            <input
              className={FIELD_CLASS}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        </div>
        <label className="mt-4 block text-sm">
          Hipóteses (opcional)
          <textarea
            className={TEXTAREA_CLASS}
            value={hypotheses}
            onChange={(event) => setHypotheses(event.target.value)}
          />
        </label>
        <div className="mt-4">
          <p className="text-sm font-medium">Alterações hipotéticas</p>
          {changes.map((line, index) => (
            <div key={index} className="mt-2 grid gap-2 lg:grid-cols-5">
              <select
                className={FIELD_CLASS}
                aria-label={`Tipo ${index + 1}`}
                value={line.type}
                onChange={(event) => update(index, 'type', event.target.value)}
              >
                {CHANGE_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                className={FIELD_CLASS}
                aria-label={`ID da meta ${index + 1}`}
                placeholder="ID da meta"
                value={line.goalId}
                onChange={(event) => update(index, 'goalId', event.target.value)}
              />
              <input
                className={FIELD_CLASS}
                aria-label={`ID do projeto ${index + 1}`}
                placeholder="ID do projeto"
                value={line.projectId}
                onChange={(event) => update(index, 'projectId', event.target.value)}
              />
              <input
                className={FIELD_CLASS}
                aria-label={`ID da tarefa ${index + 1}`}
                placeholder="ID da tarefa"
                value={line.taskId}
                onChange={(event) => update(index, 'taskId', event.target.value)}
              />
              <input
                className={FIELD_CLASS}
                aria-label={`ID da área ${index + 1}`}
                placeholder="ID da área"
                value={line.areaId}
                onChange={(event) => update(index, 'areaId', event.target.value)}
              />
              <input
                className={FIELD_CLASS}
                type="number"
                aria-label={`Valor ${index + 1}`}
                placeholder="Valor"
                value={line.value}
                onChange={(event) => update(index, 'value', event.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                className="lg:col-span-5"
                disabled={changes.length === 1}
                onClick={() => setChanges((current) => current.filter((_, i) => i !== index))}
              >
                Remover alteração
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="mt-2 min-h-11"
            onClick={() => setChanges((current) => [...current, { ...EMPTY_CHANGE }])}
          >
            Adicionar alteração
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            className="min-h-11"
            disabled={busy}
            onClick={() => void simulate()}
          >
            Comparar com a base
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={busy || name.trim() === ''}
            onClick={() => void save()}
          >
            Salvar cenário
          </Button>
        </div>
      </section>

      {comparison !== null && (
        <section aria-label="Comparação" className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold">Diferenças em relação à base</h3>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Minutos comprometidos</dt>
              <dd>
                {comparison.deltas.committedMinutes >= 0 ? '+' : ''}
                {formatMinutes(comparison.deltas.committedMinutes)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Minutos restantes</dt>
              <dd>
                {comparison.deltas.remainingMinutes >= 0 ? '+' : ''}
                {formatMinutes(comparison.deltas.remainingMinutes)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Sobrecarga</dt>
              <dd>
                {comparison.deltas.overloadMinutes >= 0 ? '+' : ''}
                {formatMinutes(comparison.deltas.overloadMinutes)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cobertura</dt>
              <dd>
                {comparison.deltas.coverage >= 0 ? '+' : ''}
                {Math.round(comparison.deltas.coverage * 100)} p.p.
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm">
            Prioridades base: {comparison.deltas.topPriorityIds.join(', ') || 'nenhuma'} · Cenário:{' '}
            {comparison.scenario.priorities
              .slice(0, 3)
              .map((item) => item.id)
              .join(', ') || 'nenhuma'}
          </p>
          {comparison.scenario.ignored.length > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              Hipóteses ignoradas: {comparison.scenario.ignored.join('; ')}
            </p>
          )}
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {comparison.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      <ResourceView state={scenarios} emptyTitle="Nenhum cenário salvo">
        {(data) => (
          <section
            aria-label="Cenários salvos"
            className="rounded-xl border border-border bg-card p-5"
          >
            <h3 className="text-base font-semibold">Cenários salvos</h3>
            <ul className="mt-3 divide-y divide-border text-sm">
              {data.map((scenario) => (
                <li key={scenario.id} className="py-3">
                  <p className="font-medium">{scenario.name}</p>
                  <p className="text-muted-foreground">
                    Semana {formatDate(scenario.weekStart)} · {scenario.changes.length}{' '}
                    alteração(ões) · v{scenario.version}
                  </p>
                  {scenario.hypotheses !== null && (
                    <p className="mt-1 text-muted-foreground">{scenario.hypotheses}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </ResourceView>
    </div>
  );
}
