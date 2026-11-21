import { useState, type FormEvent } from 'react';
import type { AccountSummary } from '@/features/auth/use-session';
import { EmptyState, ErrorPanel, LoadingPanel } from '@/components/states';
import { Button } from '@/components/ui/button';
import { ApiError, studiesApi } from '@/lib/api';
import { useStudies } from './use-studies';
import { localDateIn, zonedDateTimeToIso } from './time';

interface StudiesPageProps {
  account: AccountSummary;
}

function newKey(): string {
  return crypto.randomUUID();
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return `${hours} h ${rest} min`;
}

export function StudiesPage({ account }: StudiesPageProps) {
  const { state, range, reload } = useStudies(account.user.timezone);
  const [topic, setTopic] = useState('');
  const [localDate, setLocalDate] = useState(() => localDateIn(account.user.timezone, new Date()));
  const [localTime, setLocalTime] = useState('09:00');
  const [duration, setDuration] = useState(30);
  const [courseId, setCourseId] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [mutation, setMutation] = useState<
    | { status: 'idle' }
    | { status: 'saving' }
    | { status: 'error'; message: string }
    | { status: 'success'; message: string }
  >({ status: 'idle' });
  const [sessionKey, setSessionKey] = useState(newKey);
  const [courseKey, setCourseKey] = useState(newKey);

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
          courseId: courseId === '' ? null : courseId,
        },
        sessionKey,
      );
      setTopic('');
      setSessionKey(newKey());
      setMutation({ status: 'success', message: 'Sessão registrada com sucesso.' });
      reload();
    } catch (error) {
      setMutation({
        status: 'error',
        message:
          error instanceof ApiError
            ? `Não foi possível registrar: ${error.message}`
            : 'Não foi possível registrar a sessão.',
      });
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
      setMutation({
        status: 'error',
        message:
          error instanceof ApiError
            ? `Não foi possível criar: ${error.message}`
            : 'Falha ao criar curso.',
      });
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
          Cursos e sessões reais, com duração proveniente do registro. Os minutos exibidos são
          calculados pelo servidor a partir da duração da sessão, com procedência explícita.
        </p>
      </div>

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
          <section aria-label="Resumo do período">
            <dl className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  label: 'Minutos estudados',
                  value: formatMinutes(state.dashboard.summary.totalMinutes),
                },
                { label: 'Sessões', value: String(state.dashboard.summary.sessionCount) },
                { label: 'Dias com estudo', value: String(state.dashboard.summary.daysStudied) },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-border bg-card p-4">
                  <dt className="text-xs text-muted-foreground">{item.label}</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums">{item.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">
              Período de {range.from} a {range.to} no fuso {state.dashboard.period.timezone}.
            </p>
          </section>

          {state.sessions.length === 0 ? (
            <EmptyState
              eyebrow="Sem dados"
              title="Nenhuma sessão registrada"
              description="Registre sua primeira sessão abaixo. Nenhum número é exibido antes de existir um registro real."
            />
          ) : (
            <section aria-labelledby="sessions-title">
              <h3 id="sessions-title" className="text-base font-semibold">
                Sessões recentes
              </h3>
              <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
                {state.sessions.map((session) => (
                  <li
                    key={session.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-4"
                  >
                    <div>
                      <p className="text-sm font-medium">{session.topic}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {session.localDate} · {session.durationMinutes} min · {session.timezone}
                      </p>
                    </div>
                    <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
                      v{session.version}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Registros">
        <form
          onSubmit={(event) => void submitSession(event)}
          className="space-y-4 rounded-xl border border-border bg-card p-5"
        >
          <div>
            <h3 className="text-base font-semibold">Registrar sessão</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              O horário é interpretado no fuso da sua conta.
            </p>
          </div>
          <label className="block text-sm">
            <span className="text-muted-foreground">Tópico</span>
            <input
              required
              maxLength={200}
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3"
            />
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
                value={courseId}
                onChange={(event) => setCourseId(event.target.value)}
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
