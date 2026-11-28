import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  CorrectPersonalObservationRequest,
  CreatePersonalObservationRequest,
  GoalDto,
  LifeGoalDto,
  PersonalObservationDto,
  ObservationSummaryDto,
  PersonalObservationKind,
  ProjectSummaryDto,
  TaskDto,
} from '@personal-os/shared';
import type { AccountSummary } from '@/features/auth/use-session';
import { EmptyState, ErrorPanel, LoadingPanel } from '@/components/states';
import { Button } from '@/components/ui/button';
import { ApiError, goalsApi, observationsApi, projectsApi, studiesApi, tasksApi } from '@/lib/api';
import { localDateIn } from '@/features/studies/time';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      items: PersonalObservationDto[];
      nextCursor?: string;
      hasMore: boolean;
      summary: ObservationSummaryDto | null;
      summaryError: string | null;
    };

type MutationState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'error'; message: string }
  | { status: 'success'; message: string };

interface Option {
  id: string;
  label: string;
}

const KINDS: Array<{ value: PersonalObservationKind; label: string; help: string }> = [
  { value: 'executed', label: 'Atividade executada', help: 'Algo que você fez de fato.' },
  {
    value: 'observed_result',
    label: 'Resultado observado',
    help: 'Resultado percebido, ainda não confirmado.',
  },
  {
    value: 'confirmed_result',
    label: 'Resultado confirmado',
    help: 'Resultado verificado com evidência.',
  },
  { value: 'intention', label: 'Intenção', help: 'Intenção declarada; não é execução.' },
  { value: 'planning', label: 'Planejamento', help: 'Plano; não é fato executado.' },
  { value: 'inference', label: 'Inferência', help: 'Hipótese/derivação; exige confidence.' },
];

function newKey(): string {
  return crypto.randomUUID();
}

function defaultFrom(today: string): string {
  const d = new Date(`${today}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 13);
  return d.toISOString().slice(0, 10);
}

function kindLabel(kind: PersonalObservationKind): string {
  return KINDS.find((k) => k.value === kind)?.label ?? kind;
}

function statusLabel(status: string): string {
  if (status === 'active') return 'Ativa';
  if (status === 'superseded') return 'Corrigida/substituída';
  if (status === 'archived') return 'Arquivada';
  return status;
}

function fmtDateTime(value: string, timezone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(date);
}

function asError(error: unknown, prefix: string): string {
  if (error instanceof ApiError) return `${prefix}: ${error.message}`;
  return `${prefix}. Tente novamente.`;
}

export function ObservationsPage({ account }: { account: AccountSummary }) {
  const today = useMemo(
    () => localDateIn(account.user.timezone, new Date()),
    [account.user.timezone],
  );
  const [from, setFrom] = useState(() => defaultFrom(today));
  const [to, setTo] = useState(today);
  const [kindFilter, setKindFilter] = useState<PersonalObservationKind | ''>('');
  const [areaFilter, setAreaFilter] = useState('');
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [mutation, setMutation] = useState<MutationState>({ status: 'idle' });
  const [createKey, setCreateKey] = useState(newKey);
  const [correctKey, setCorrectKey] = useState(newKey);
  const [editing, setEditing] = useState<PersonalObservationDto | null>(null);

  const [areas, setAreas] = useState<Option[]>([]);
  const [goals, setGoals] = useState<Option[]>([]);
  const [projects, setProjects] = useState<Option[]>([]);
  const [tasks, setTasks] = useState<Option[]>([]);

  // Capture form
  const [kind, setKind] = useState<PersonalObservationKind>('executed');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [localDate, setLocalDate] = useState(today);
  const [localTime, setLocalTime] = useState('09:00');
  const [areaId, setAreaId] = useState('');
  const [valueNum, setValueNum] = useState('');
  const [unit, setUnit] = useState('');
  const [confidence, setConfidence] = useState('');
  const [relatedGoalId, setRelatedGoalId] = useState('');
  const [relatedProjectId, setRelatedProjectId] = useState('');
  const [relatedTaskId, setRelatedTaskId] = useState('');
  const [evidenceLabel, setEvidenceLabel] = useState('');

  const loadRefs = useCallback(async (signal: AbortSignal) => {
    const [areasRes, goalsRes, projectsRes, tasksRes] = await Promise.allSettled([
      studiesApi.areas(signal),
      goalsApi.list({ limit: 50 }, signal),
      projectsApi.list({ limit: 50 }, signal),
      tasksApi.list({ limit: 50 }, signal),
    ]);
    if (areasRes.status === 'fulfilled') {
      setAreas(areasRes.value.map((a) => ({ id: a.id, label: a.name })));
    }
    if (goalsRes.status === 'fulfilled') {
      setGoals(
        goalsRes.value.items.map((g: GoalDto | LifeGoalDto) => ({ id: g.id, label: g.title })),
      );
    }
    if (projectsRes.status === 'fulfilled') {
      setProjects(
        projectsRes.value.items.map((p: ProjectSummaryDto) => ({ id: p.id, label: p.title })),
      );
    }
    if (tasksRes.status === 'fulfilled') {
      setTasks(tasksRes.value.items.map((t: TaskDto) => ({ id: t.id, label: t.title })));
    }
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setState({ status: 'loading' });
      try {
        const [list, summaryRes] = await Promise.all([
          observationsApi.list(
            {
              from,
              to,
              ...(kindFilter ? { kind: kindFilter } : {}),
              ...(areaFilter ? { areaId: areaFilter } : {}),
              limit: 50,
            },
            signal,
          ),
          observationsApi
            .summary({ from, to, ...(areaFilter ? { areaId: areaFilter } : {}) }, signal)
            .catch((e: unknown) => e),
        ]);
        if (signal?.aborted) return;
        const summary = summaryRes instanceof Error ? null : (summaryRes as ObservationSummaryDto);
        const summaryError =
          summaryRes instanceof Error
            ? asError(summaryRes, 'Não foi possível calcular indicadores')
            : null;
        setState({
          status: 'ready',
          items: list.items,
          nextCursor: list.nextCursor,
          hasMore: list.hasMore,
          summary,
          summaryError,
        });
      } catch (error) {
        if (signal?.aborted) return;
        setState({
          status: 'error',
          message: asError(error, 'Não foi possível carregar observações'),
        });
      }
    },
    [from, to, kindFilter, areaFilter],
  );

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carregamento assíncrono de referências; setState ocorre após await
    void loadRefs(controller.signal);
    return () => controller.abort();
  }, [loadRefs]);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carregamento assíncrono de dados; setState ocorre após await
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function observedAtIso(): string {
    const [y, m, d] = localDate.split('-').map(Number);
    const [hh, mm] = localTime.split(':').map(Number);
    // Build a date in the user's timezone by using Intl parts round-trip via local offset guess.
    // Simpler: construct UTC from local parts and adjust by getting timezone offset at that instant.
    const guess = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0));
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: account.user.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const parts = Object.fromEntries(fmt.formatToParts(guess).map((p) => [p.type, p.value]));
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const offsetMs = asUtc - guess.getTime();
    return new Date(guess.getTime() - offsetMs).toISOString();
  }

  function resetForm() {
    setTitle('');
    setContent('');
    setValueNum('');
    setUnit('');
    setConfidence('');
    setEvidenceLabel('');
    setRelatedGoalId('');
    setRelatedProjectId('');
    setRelatedTaskId('');
    setAreaId('');
    setKind('executed');
    setLocalDate(today);
    setLocalTime('09:00');
    setEditing(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMutation({ status: 'saving' });
    const evidence = evidenceLabel.trim()
      ? [{ type: 'note', id: `note:${Date.now()}`, label: evidenceLabel.trim() }]
      : [];
    try {
      if (editing) {
        const input: CorrectPersonalObservationRequest = {
          kind,
          title: title.trim(),
          content: content.trim() || null,
          observedAt: observedAtIso(),
          timezone: account.user.timezone,
          valueNum: valueNum.trim() === '' ? null : Number(valueNum),
          unit: unit.trim() || null,
          confidence: confidence.trim() === '' ? null : Number(confidence),
          evidence,
          areaId: areaId || null,
          relatedGoalId: relatedGoalId || null,
          relatedProjectId: relatedProjectId || null,
          relatedTaskId: relatedTaskId || null,
        };
        await observationsApi.correct(editing.id, input, correctKey, editing.version);
        setCorrectKey(newKey());
        setMutation({
          status: 'success',
          message: 'Observação corrigida. A versão anterior foi preservada como substituída.',
        });
      } else {
        const input: CreatePersonalObservationRequest = {
          kind,
          title: title.trim(),
          content: content.trim() || null,
          observedAt: observedAtIso(),
          timezone: account.user.timezone,
          valueNum: valueNum.trim() === '' ? null : Number(valueNum),
          unit: unit.trim() || null,
          confidence: confidence.trim() === '' ? null : Number(confidence),
          evidence,
          areaId: areaId || null,
          relatedGoalId: relatedGoalId || null,
          relatedProjectId: relatedProjectId || null,
          relatedTaskId: relatedTaskId || null,
        };
        await observationsApi.create(input, createKey);
        setCreateKey(newKey());
        setMutation({
          status: 'success',
          message: 'Observação registrada com proveniência e data local explícitas.',
        });
      }
      resetForm();
      await load();
    } catch (error) {
      setCorrectKey(newKey());
      setCreateKey(newKey());
      setMutation({
        status: 'error',
        message: asError(
          error,
          editing
            ? 'Não foi possível corrigir a observação'
            : 'Não foi possível registrar a observação',
        ),
      });
    }
  }

  function startEdit(item: PersonalObservationDto) {
    setEditing(item);
    setKind(item.kind);
    setTitle(item.title);
    setContent(item.content ?? '');
    setLocalDate(item.localDate);
    const d = new Date(item.observedAt);
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: item.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
    setLocalTime(`${parts.hour ?? '09'}:${parts.minute ?? '00'}`);
    setAreaId(item.areaId ?? '');
    setValueNum(item.valueNum === null ? '' : String(item.valueNum));
    setUnit(item.unit ?? '');
    setConfidence(item.confidence === null ? '' : String(item.confidence));
    setRelatedGoalId(item.relatedGoalId ?? '');
    setRelatedProjectId(item.relatedProjectId ?? '');
    setRelatedTaskId(item.relatedTaskId ?? '');
    setEvidenceLabel(item.evidence[0]?.label ?? '');
    setMutation({ status: 'idle' });
  }

  const summary = state.status === 'ready' ? state.summary : null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Observações pessoais
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Registrar fatos, resultados e inferências
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Capture observações reais sem transformar intenção em execução, execução em resultado ou
          inferência em fato. Cada registro tem data local, proveniência e histórico de correção.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">
          {editing ? 'Corrigir observação' : 'Captura rápida'}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {editing
            ? `Corrigindo ${editing.id}. A versão anterior será preservada como substituída.`
            : 'Registro manual com proveniência explícita (src_manual). Campos opcionais podem ficar vazios.'}
        </p>
        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={submit}>
          <label className="text-sm">
            Tipo de observação
            <select
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              value={kind}
              onChange={(e) => setKind(e.target.value as PersonalObservationKind)}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted-foreground">
              {KINDS.find((k) => k.value === kind)?.help}
            </span>
          </label>
          <label className="text-sm">
            Área (opcional)
            <select
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              value={areaId}
              onChange={(e) => setAreaId(e.target.value)}
            >
              <option value="">Sem área específica</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            Título
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
            />
          </label>
          <label className="text-sm">
            Data local
            <input
              type="date"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              value={localDate}
              onChange={(e) => setLocalDate(e.target.value)}
              required
            />
          </label>
          <label className="text-sm">
            Hora local
            <input
              type="time"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              value={localTime}
              onChange={(e) => setLocalTime(e.target.value)}
              required
            />
          </label>
          <label className="text-sm">
            Valor numérico (opcional)
            <input
              type="number"
              step="any"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              value={valueNum}
              onChange={(e) => setValueNum(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Unidade (opcional)
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              maxLength={32}
              placeholder="min, kg, R$, páginas..."
            />
          </label>
          <label className="text-sm md:col-span-2">
            Conteúdo/descrição (opcional)
            <textarea
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={5000}
              rows={3}
            />
          </label>
          <label className="text-sm">
            Confidence 0-1 {kind === 'inference' ? '(obrigatório para inferência)' : '(opcional)'}
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              value={confidence}
              onChange={(e) => setConfidence(e.target.value)}
              required={kind === 'inference'}
            />
          </label>
          <label className="text-sm">
            Evidência/nota (opcional)
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              value={evidenceLabel}
              onChange={(e) => setEvidenceLabel(e.target.value)}
              maxLength={200}
              placeholder="Ex.: captura de tela, link, medição"
            />
          </label>
          <label className="text-sm">
            Tarefa relacionada (opcional)
            <select
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              value={relatedTaskId}
              onChange={(e) => setRelatedTaskId(e.target.value)}
            >
              <option value="">Nenhuma</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Projeto relacionado (opcional)
            <select
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              value={relatedProjectId}
              onChange={(e) => setRelatedProjectId(e.target.value)}
            >
              <option value="">Nenhum</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Objetivo relacionado (opcional)
            <select
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              value={relatedGoalId}
              onChange={(e) => setRelatedGoalId(e.target.value)}
            >
              <option value="">Nenhum</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2 md:col-span-2">
            <Button type="submit" disabled={mutation.status === 'saving'}>
              {mutation.status === 'saving'
                ? 'Salvando...'
                : editing
                  ? 'Salvar correção'
                  : 'Registrar observação'}
            </Button>
            {editing && (
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancelar correção
              </Button>
            )}
          </div>
        </form>
        {mutation.status === 'error' && (
          <p className="mt-3 text-sm text-red-600">{mutation.message}</p>
        )}
        {mutation.status === 'success' && (
          <p className="mt-3 text-sm text-emerald-700">{mutation.message}</p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Histórico e indicadores</h2>
            <p className="text-xs text-muted-foreground">
              Indicadores usam apenas registros ativos no período; dias ausentes não viram zero.
            </p>
          </div>
          <label className="text-xs">
            De{' '}
            <input
              type="date"
              className="ml-1 rounded-md border border-border bg-background px-2 py-1"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-xs">
            Até{' '}
            <input
              type="date"
              className="ml-1 rounded-md border border-border bg-background px-2 py-1"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label className="text-xs">
            Filtrar tipo
            <select
              className="ml-1 rounded-md border border-border bg-background px-2 py-1"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as PersonalObservationKind | '')}
            >
              <option value="">Todos</option>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            Área
            <select
              className="ml-1 rounded-md border border-border bg-background px-2 py-1"
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
            >
              <option value="">Todas</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" variant="secondary" onClick={() => void load()}>
            Atualizar
          </Button>
        </div>

        {summary && (
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-border p-3">
              <div className="text-xs text-muted-foreground">Observações ativas</div>
              <div className="text-xl font-semibold">{summary.totalObservations}</div>
            </div>
            <div className="rounded-xl border border-border p-3">
              <div className="text-xs text-muted-foreground">Cobertura</div>
              <div className="text-xl font-semibold">
                {summary.coverage.coveragePercent === null
                  ? 'N/A'
                  : `${summary.coverage.coveragePercent}%`}
              </div>
              <div className="text-xs text-muted-foreground">
                {summary.coverage.daysWithObservations}/{summary.coverage.daysInRange} dias com
                registro
              </div>
            </div>
            <div className="rounded-xl border border-border p-3">
              <div className="text-xs text-muted-foreground">Dias sem registro</div>
              <div className="text-xl font-semibold">{summary.coverage.missingDays}</div>
              <div className="text-xs text-muted-foreground">
                Ausência explícita, sem zero fictício
              </div>
            </div>
            <div className="rounded-xl border border-border p-3">
              <div className="text-xs text-muted-foreground">Algoritmo</div>
              <div className="text-sm font-medium">{summary.algorithmVersion}</div>
            </div>
          </div>
        )}
        {summary && summary.limitations.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <strong>Limitações:</strong>
            <ul className="mt-1 list-disc pl-4">
              {summary.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        )}
        {state.status === 'ready' && state.summaryError && (
          <p className="mt-3 text-xs text-amber-700">{state.summaryError}</p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">Registros</h2>
        {state.status === 'loading' && <LoadingPanel label="Carregando observações..." />}
        {state.status === 'error' && (
          <ErrorPanel title="Erro ao carregar" message={state.message} />
        )}
        {state.status === 'ready' && state.items.length === 0 && (
          <EmptyState
            eyebrow="Sem observações"
            title="Nenhuma observação no filtro atual"
            description="Registre um fato real, resultado observado/confirmado ou inferência explicitamente rotulada. Períodos sem registro permanecem como lacuna."
          />
        )}
        {state.status === 'ready' && state.items.length > 0 && (
          <div className="mt-3 space-y-3">
            {state.items.map((item) => (
              <article key={item.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <span>{kindLabel(item.kind)}</span>
                      <span>•</span>
                      <span>{statusLabel(item.status)}</span>
                      <span>•</span>
                      <span>{item.localDate}</span>
                    </div>
                    <h3 className="mt-1 font-medium text-foreground">{item.title}</h3>
                    {item.content && (
                      <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                        {item.content}
                      </p>
                    )}
                  </div>
                  {item.status === 'active' && (
                    <Button type="button" variant="secondary" onClick={() => startEdit(item)}>
                      Corrigir
                    </Button>
                  )}
                </div>
                <dl className="mt-2 grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
                  <div>
                    <dt className="inline font-medium">Observado em: </dt>
                    <dd className="inline">
                      {fmtDateTime(item.observedAt, item.timezone)} ({item.timezone})
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Origem: </dt>
                    <dd className="inline">
                      {item.sourceId}
                      {item.algorithmVersion ? ` / ${item.algorithmVersion}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Valor: </dt>
                    <dd className="inline">
                      {item.valueNum !== null
                        ? `${item.valueNum}${item.unit ? ` ${item.unit}` : ''}`
                        : (item.valueText ?? '—')}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Confidence: </dt>
                    <dd className="inline">
                      {item.confidence !== null ? item.confidence : '—'}
                      {item.kind === 'inference' ? ' (inferência)' : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Área: </dt>
                    <dd className="inline">
                      {areas.find((a) => a.id === item.areaId)?.label ?? item.areaId ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Versão: </dt>
                    <dd className="inline">
                      v{item.version}
                      {item.correctsId ? ` (corrige ${item.correctsId})` : ''}
                      {item.supersededBy ? ` (substituída por ${item.supersededBy})` : ''}
                    </dd>
                  </div>
                  <div className="md:col-span-2">
                    <dt className="inline font-medium">Relações: </dt>
                    <dd className="inline">
                      {[
                        item.relatedTaskId ? `tarefa ${item.relatedTaskId}` : null,
                        item.relatedProjectId ? `projeto ${item.relatedProjectId}` : null,
                        item.relatedGoalId ? `objetivo ${item.relatedGoalId}` : null,
                        item.relatedStudySessionId ? `estudo ${item.relatedStudySessionId}` : null,
                        item.relatedCourseId ? `curso ${item.relatedCourseId}` : null,
                      ]
                        .filter(Boolean)
                        .join(', ') || '—'}
                    </dd>
                  </div>
                  <div className="md:col-span-2">
                    <dt className="inline font-medium">Evidência: </dt>
                    <dd className="inline">
                      {item.evidence.length > 0
                        ? item.evidence.map((e) => e.label ?? `${e.type}:${e.id}`).join(', ')
                        : 'não informada'}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
