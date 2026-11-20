import type { HealthResponse } from '@personal-os/shared';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { fetchHealth } from '@/lib/api';
import { cn } from '@/lib/utils';

type HealthState =
  { status: 'loading' } | { status: 'ready'; data: HealthResponse } | { status: 'error' };

const STATUS_LABEL: Record<HealthState['status'], string> = {
  loading: 'Verificando',
  ready: 'API online',
  error: 'API offline',
};

const STATUS_CLASS: Record<HealthState['status'], string> = {
  loading: 'bg-amber-500',
  ready: 'bg-emerald-500',
  error: 'bg-red-500',
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
}

export function App() {
  const [health, setHealth] = useState<HealthState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    fetchHealth(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setHealth({ status: 'ready', data });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setHealth({ status: 'error' });
        }
      });

    return () => controller.abort();
  }, [attempt]);

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top_left,_#ccfbf1_0,_transparent_38%),radial-gradient(circle_at_bottom_right,_#e2e8f0_0,_transparent_42%)]">
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 py-8 sm:px-8 lg:py-12">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="grid size-11 place-items-center rounded-xl bg-slate-900 text-lg font-bold text-teal-300 shadow-lg shadow-slate-900/20"
            >
              P
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight text-slate-900">Personal OS</p>
              <p className="text-xs text-muted-foreground">Fundação técnica · Fase 1</p>
            </div>
          </div>

          <span className="rounded-full border border-border bg-white/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
            Tarefa 1.1
          </span>
        </header>

        <main className="grid flex-1 items-start gap-6 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:py-16">
          <section className="max-w-2xl">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800">
              <span className="size-1.5 rounded-full bg-teal-600" aria-hidden="true" />
              API-only · D1 · PWA
            </p>

            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Sua vida, em um sistema.
            </h1>

            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
              Bootstrap executável do Personal OS: frontend React, API Hono no Cloudflare Worker, D1
              local e contratos compartilhados. Sem módulos de negócio e sem autenticação nesta
              tarefa.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                ['Frontend', 'React 19 · Vite · Tailwind'],
                ['Backend', 'Hono · Worker · Zod'],
                ['Persistência', 'D1 · binding local'],
              ].map(([title, detail]) => (
                <div
                  key={title}
                  className="rounded-xl border border-border bg-white/75 p-4 shadow-sm backdrop-blur"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {title}
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-800">{detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-xl border border-slate-200 bg-slate-900 p-5 text-slate-200 shadow-xl shadow-slate-900/10">
              <p className="text-xs uppercase tracking-widest text-slate-400">Próximo marco</p>
              <p className="mt-2 text-sm leading-6">
                Tarefa 1.2: schema inicial, migrações e autenticação por passkeys. Nada avança sem
                aprovação da fundação.
              </p>
            </div>
          </section>

          <section
            aria-live="polite"
            className="rounded-2xl border border-border bg-white/85 p-6 shadow-xl shadow-slate-900/5 backdrop-blur"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Status do ambiente</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Verificação real via <code className="text-xs">/api/v1/health</code>
                </p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                <span
                  className={cn('size-2 rounded-full', STATUS_CLASS[health.status])}
                  aria-hidden="true"
                />
                {STATUS_LABEL[health.status]}
              </span>
            </div>

            <dl className="mt-6 space-y-4 text-sm">
              <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
                <dt className="text-muted-foreground">Aplicação</dt>
                <dd className="font-medium text-slate-900">
                  {health.status === 'ready' ? 'Operacional' : 'Aguardando resposta'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
                <dt className="text-muted-foreground">D1</dt>
                <dd className="font-medium text-slate-900">
                  {health.status === 'ready' ? health.data.db : '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
                <dt className="text-muted-foreground">Versão</dt>
                <dd className="font-mono text-xs text-slate-900">
                  {health.status === 'ready' ? health.data.version : '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Última verificação</dt>
                <dd className="text-right font-mono text-xs text-slate-900">
                  {health.status === 'ready' ? formatDateTime(health.data.time) : '—'}
                </dd>
              </div>
            </dl>

            {health.status === 'error' && (
              <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">
                Não foi possível falar com a API. Verifique se <code>npm run dev:api</code> está em
                execução na porta 8787.
              </p>
            )}

            <Button
              type="button"
              variant="outline"
              className="mt-6 w-full"
              onClick={() => {
                setHealth({ status: 'loading' });
                setAttempt((current) => current + 1);
              }}
            >
              Verificar novamente
            </Button>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              Sem autenticação nesta etapa. Não use com dados reais ainda.
            </p>
          </section>
        </main>

        <footer className="flex flex-col gap-2 border-t border-border pt-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>Personal OS · fundação verificável</p>
          <p>Node 24 · Cloudflare Workers · D1</p>
        </footer>
      </div>
    </div>
  );
}
