import { useState, type FormEvent } from 'react';
import type { AccountSummary } from '@/features/auth/use-session';
import { EmptyState, ErrorPanel, LoadingPanel } from '@/components/states';
import { Button } from '@/components/ui/button';
import { ApiError, studiesApi } from '@/lib/api';
import { localDateIn, zonedDateTimeToIso } from './time';
import { formatMinutes } from './format';
import { topicMaxLength, topicRemaining } from './topic';
import { PERIOD_OPTIONS, useStudies, type PeriodDays } from './use-studies';
import { StudiesInsights } from './StudiesInsights';

interface StudiesPageProps {
  account: AccountSummary;
}

type MutationState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'error'; message: string }
  | { status: 'success'; message: string };

function newKey(): string {
  return crypto.randomUUID();
}

export function StudiesPage({ account }: StudiesPageProps) {
  const {
    state,
    range,
    periodDays,
    courseId,
    loadingMore,
    setPeriodDays,
    setCourseId,
    loadMore,
    reload,
  } = useStudies(account.user.timezone);
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [localDate, setLocalDate] = useState(() => localDateIn(account.user.timezone, new Date()));
  const [localTime, setLocalTime] = useState('09:00');
  const [duration, setDuration] = useState(30);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [goalTitle, setGoalTitle] = useState('');
  const [goalStart, setGoalStart] = useState(() => localDateIn(account.user.timezone, new Date()));
  const [goalTarget, setGoalTarget] = useState(() =>
    localDateIn(account.user.timezone, new Date()),
  );
  const [goalMinutes, setGoalMinutes] = useState(600);
  const [mutation, setMutation] = useState<MutationState>({ status: 'idle' });
  const [sessionKey, setSessionKey] = useState(newKey);
  const [courseKey, setCourseKey] = useState(newKey);
  const [goalKey, setGoalKey] = useState(newKey);

  function failure(error: unknown, prefix: string): void {
    setMutation({
      status: 'error',
      message:
        error instanceof ApiError ? `${prefix}: ${error.message}` : `${prefix}. Tente novamente.`,
    });
  }

  async function submitSession(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMutation({ status: 'saving' });
    try {
      await studiesApi.createSession(
        {
          topic: topic.trim(),
          startedAt: zonedDateTimeToIso(localDate, localTime, account.user.timezone),
          timezone: account.user.timezone,
          durationMinutes: duration,
          courseId: selectedCourseId === '' ? null : selectedCourseId,
          notes: notes.trim() === '' ? null : notes.trim(),
        },
        sessionKey,
      );
      setTopic('');
      setNotes('');
      setSessionKey(newKey());
      setMutation({ status: 'success', message: 'Sessão registrada com sucesso.' });
      reload();
    } catch (error) {
      // A reserva idempotente da tentativa falha permanece no banco; uma nova
      // chave evita que o retry (com título/topic corrigido) fique preso no 409.
      setSessionKey(newKey());
      failure(error, 'Não foi possível registrar a sessão');
    }
  }

  async function submitCourse(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMutation({ status: 'saving' });
    try {
      await studiesApi.createCourse({ title: courseTitle.trim() }, courseKey);
      setCourseTitle('');
      setCourseKey(newKey());
      setMutation({ status: 'success', message: 'Curso criado com sucesso.' });
      reload();
    } catch (error) {
      setCourseKey(newKey());
      failure(error, 'Não foi possível criar o curso');
    }
  }

  async function submitGoal(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMutation({ status: 'saving' });
    try {
      await studiesApi.createGoal(
        {
          title: goalTitle.trim(),
          horizon: 'medium',
          status: 'active',
          priority: 3,
          startDate: goalStart,
          targetDate: goalTarget,
          targetMinutes: goalMinutes,
        },
        goalKey,
      );
      setGoalTitle('');
      setGoalKey(newKey());
      setMutation({ status: 'success', message: 'Meta criada com sucesso.' });
      reload();
    } catch (error) {
      setGoalKey(newKey());
      failure(error, 'Não foi possível criar a meta');
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
          Áreas da vida
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Estudos</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Registros reais de estudo, com duração e minutos calculados pelo servidor. Todo indicador
          exibido deriva das sessões do período selecionado; metas usam o mesmo alvo de minutos.
        </p>
      </div>

      <section aria-label="Filtros" className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-muted-foreground">Período</span>
          <select
            value={periodDays}
            onChange={(event) => setPeriodDays(Number(event.target.value) as PeriodDays)}
            className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3"
          >
            {PERIOD_OPTIONS.map((days) => (
              <option key={days} value={days}>
                Últimos {days} dias
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Curso</span>
          <select
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3"
          >
            <option value="">Todos os cursos</option>
            {(state.status === 'ready' ? state.courses : []).map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
        </label>
      </section>

      {state.status === 'loading' && <LoadingPanel label="Carregando dados de estudos…" />}

      {state.status === 'error' && (
        <ErrorPanel
          title="Estudos indisponíveis"
          message={state.message}
          onRetry={state.sessionExpired ? undefined : reload}
        />
      )}

      {state.status === 'ready' && (
        <>
          <StudiesInsights dashboard={state.dashboard} />

          {state.sessions.length === 0 ? (
            <EmptyState
              eyebrow="Sem dados"
              title="Nenhuma sessão registrada neste filtro"
              description="Registre sua primeira sessão abaixo. Nenhum número é exibido antes de existir um registro real."
            />
          ) : (
            <section aria-labelledby="sessions-title">
              <h3 id="sessions-title" className="text-base font-semibold">
                Sessões de {range.from} a {range.to}
              </h3>
              <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
                {state.sessions.map((session) => (
                  <li key={session.id} className="flex flex-wrap gap-2 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{session.topic}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {session.localDate} · {formatMinutes(session.durationMinutes)} · origem:{' '}
                        {session.sourceId}
                      </p>
                    </div>
                    <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
                      v{session.version}
                    </span>
                  </li>
                ))}
              </ul>
              {state.hasMore && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={loadingMore}
                  onClick={loadMore}
                  className="mt-3 min-h-11"
                >
                  {loadingMore ? 'Carregando…' : 'Carregar mais sessões'}
                </Button>
              )}
            </section>
          )}
        </>
      )}

      <section className="grid gap-4 lg:grid-cols-3" aria-label="Registros">
        <form
          onSubmit={(event) => void submitSession(event)}
          className="space-y-4 rounded-xl border border-border bg-card p-5"
        >
          <div>
            <h3 className="text-base font-semibold">Registrar sessão</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              O horário é interpretado no fuso da sua conta. Observações ficam no registro e não
              entram na auditoria.
            </p>
          </div>
          <label className="block text-sm">
            <span className="text-muted-foreground">Tópico (máx. {topicMaxLength})</span>
            <input
              required
              maxLength={topicMaxLength}
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              aria-describedby="topic-remaining"
              className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3"
            />
            <span id="topic-remaining" className="mt-1 block text-[11px] text-muted-foreground">
              {topicRemaining(topic)} caracteres disponíveis
            </span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-muted-foreground">Data</span>
              <input
                type="date"
                required
                value={localDate}
                onChange={(event) => setLocalDate(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Hora</span>
              <input
                type="time"
                required
                value={localTime}
                onChange={(event) => setLocalTime(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-muted-foreground">Duração (min)</span>
              <input
                type="number"
                required
                min={1}
                max={1440}
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
                className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Curso (opcional)</span>
              <select
                value={selectedCourseId}
                onChange={(event) => setSelectedCourseId(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3"
              >
                <option value="">Nenhum</option>
                {(state.status === 'ready' ? state.courses : []).map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-muted-foreground">Observações (opcional)</span>
            <textarea
              rows={2}
              maxLength={2000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <Button type="submit" disabled={mutation.status === 'saving'} className="min-h-11 w-full">
            Registrar sessão
          </Button>
        </form>

        <form
          onSubmit={(event) => void submitCourse(event)}
          className="space-y-4 rounded-xl border border-border bg-card p-5"
        >
          <div>
            <h3 className="text-base font-semibold">Novo curso</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Estrutura opcional para organizar as sessões.
            </p>
          </div>
          <label className="block text-sm">
            <span className="text-muted-foreground">Título</span>
            <input
              required
              maxLength={200}
              value={courseTitle}
              onChange={(event) => setCourseTitle(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3"
            />
          </label>
          <Button type="submit" disabled={mutation.status === 'saving'} className="min-h-11 w-full">
            Criar curso
          </Button>
        </form>

        <form
          onSubmit={(event) => void submitGoal(event)}
          className="space-y-4 rounded-xl border border-border bg-card p-5"
        >
          <div>
            <h3 className="text-base font-semibold">Nova meta</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Meta de minutos em um período definido; o progresso vem das sessões registradas.
            </p>
          </div>
          <label className="block text-sm">
            <span className="text-muted-foreground">Título</span>
            <input
              required
              maxLength={200}
              value={goalTitle}
              onChange={(event) => setGoalTitle(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-muted-foreground">Início</span>
              <input
                type="date"
                required
                value={goalStart}
                onChange={(event) => setGoalStart(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Data-alvo</span>
              <input
                type="date"
                required
                min={goalStart}
                value={goalTarget}
                onChange={(event) => setGoalTarget(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-muted-foreground">Alvo (minutos)</span>
            <input
              type="number"
              required
              min={1}
              max={1000000}
              value={goalMinutes}
              onChange={(event) => setGoalMinutes(Number(event.target.value))}
              className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3"
            />
          </label>
          <Button type="submit" disabled={mutation.status === 'saving'} className="min-h-11 w-full">
            Criar meta
          </Button>
        </form>
      </section>

      {mutation.status === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.message}
        </p>
      )}
      {mutation.status === 'success' && (
        <p role="status" className="text-sm text-primary">
          {mutation.message}
        </p>
      )}
    </div>
  );
}
