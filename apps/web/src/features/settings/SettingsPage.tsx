import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { ErrorPanel, LoadingPanel } from '@/components/states';
import type { AccountSummary } from '@/features/auth/use-session';
import { useSessions } from '@/features/auth/use-sessions';
import { formatClock } from '@/features/dashboard/format';
import { Button } from '@/components/ui/button';

interface SettingsPageProps {
  account: AccountSummary;
  onSignOut: (all: boolean) => Promise<void>;
}

function detailLabel(value: string | null, timezone: string): string {
  if (value === null) return 'Não registrado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Não registrado';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function SettingsPage({ account, onSignOut }: SettingsPageProps) {
  const { state, reload, revoke } = useSessions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível concluir a operação.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
          Sistema
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Configurações</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Dados da conta e sessões ativas. A autenticação continua sendo feita apenas por passkey.
        </p>
      </section>

      {error !== null && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4" role="alert">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <section aria-labelledby="account-title">
        <h3 id="account-title" className="text-base font-semibold">
          Conta
        </h3>
        <dl className="mt-4 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
          {[
            ['Nome', account.user.displayName],
            ['Fuso horário', account.user.timezone],
            ['Idioma', account.user.locale],
            ['Moeda', account.user.currency],
            ['Criação', detailLabel(account.user.setupCompletedAt, account.user.timezone)],
            ['Passkeys', String(account.counts.passkeys)],
          ].map(([label, value]) => (
            <div key={label} className="bg-card px-4 py-3">
              <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</dt>
              <dd className="mt-1 truncate text-sm text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="sessions-title">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h3 id="sessions-title" className="text-base font-semibold">
              Sessões ativas
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {account.counts.activeSessions} sessão(ões) reportada(s) pela API.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11"
            onClick={reload}
            disabled={state.status === 'loading'}
          >
            Atualizar
          </Button>
        </div>

        <div className="mt-4">
          {state.status === 'loading' && <LoadingPanel label="Carregando sessões…" lines={2} />}
          {state.status === 'error' && (
            <ErrorPanel
              title="Falha ao carregar sessões"
              message={state.message}
              onRetry={reload}
            />
          )}
          {state.status === 'ready' && state.sessions.length === 0 && (
            <p className="rounded-xl border border-dashed border-border bg-card/60 p-5 text-sm text-muted-foreground">
              Nenhuma sessão ativa foi retornada pela API.
            </p>
          )}
          {state.status === 'ready' && state.sessions.length > 0 && (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {state.sessions.map((session) => (
                <li
                  key={session.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 text-sm">
                    <p className="truncate font-medium">
                      {session.userAgent}
                      {session.current && (
                        <span className="ml-2 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                          atual
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Último uso: {formatClock(session.lastSeenAt, account.user.timezone)} · Expira:{' '}
                      {formatClock(session.expiresAt, account.user.timezone)}
                    </p>
                  </div>
                  {!session.current && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await revoke(session.id);
                        })
                      }
                    >
                      Revogar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="signout-title">
        <h3 id="signout-title" className="text-base font-semibold">
          Encerrar acesso
        </h3>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={busy}
            onClick={() => void run(async () => onSignOut(false))}
          >
            Encerrar esta sessão
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={busy}
            onClick={() => void run(async () => onSignOut(true))}
          >
            Encerrar todas
          </Button>
        </div>
      </section>
    </div>
  );
}
