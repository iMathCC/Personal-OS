import { useMemo, useState } from 'react';
import type { AdaptationProposalDto } from '@personal-os/shared';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorPanel, LoadingPanel } from '@/components/states';
import {
  submitAdaptationDecision,
  useAdaptationDashboard,
  useAdaptationHistory,
  type AdaptationSelection,
} from './use-adaptation';

type Tab = 'dashboard' | 'proposals' | 'scenarios' | 'history';

function severityTone(severity: string) {
  if (severity === 'critical' || severity === 'risk') return 'text-red-400';
  if (severity === 'attention') return 'text-amber-400';
  return 'text-emerald-400';
}

function statusLabel(status: string) {
  if (status === 'accepted') return 'Aceita';
  if (status === 'rejected') return 'Rejeitada';
  if (status === 'deferred') return 'Adiada';
  return 'Aberta';
}

export function AdaptationPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [selection, setSelection] = useState<AdaptationSelection>({ comparison: 'month' });
  const dashboard = useAdaptationDashboard(selection);
  const history = useAdaptationHistory();
  const [pending, setPending] = useState<{
    proposal: AdaptationProposalDto;
    action: 'accept' | 'reject' | 'defer';
  } | null>(null);
  const [note, setNote] = useState('');
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const proposals = useMemo(() => dashboard.data?.proposals ?? [], [dashboard.data?.proposals]);
  const scenarios = useMemo(
    () => proposals.flatMap((p) => p.simulations.map((s) => ({ proposal: p, simulation: s }))),
    [proposals],
  );

  async function confirmDecision() {
    if (!pending) return;
    setSubmitting(true);
    setSubmitMessage(null);
    try {
      const current = proposals.find((p) => p.id === pending.proposal.id) ?? pending.proposal;
      const version = current.status === 'open' ? 1 : 2;
      await submitAdaptationDecision({
        proposalId: pending.proposal.id,
        action: pending.action,
        note: note.trim() ? note.trim() : null,
        version,
        comparison: selection.comparison,
        ...(selection.from && selection.to ? { from: selection.from, to: selection.to } : {}),
      });
      setPending(null);
      setNote('');
      dashboard.reload();
      history.reload();
    } catch (err) {
      setSubmitMessage(err instanceof Error ? err.message : 'Falha ao registrar decisão.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-[11px] font-medium tracking-[0.14em] text-primary uppercase">
          Adaptação estratégica
        </p>
        <h1 className="text-2xl font-semibold text-foreground">Adaptação pessoal</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Propostas determinísticas baseadas em sinais observados. O sistema recomenda; nenhuma ação
          é executada automaticamente. Toda decisão é explícita e registrada.
        </p>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Seções de adaptação">
        {(
          [
            ['dashboard', 'Painel'],
            ['proposals', 'Propostas'],
            ['scenarios', 'Cenários'],
            ['history', 'Histórico'],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            variant={tab === key ? 'default' : 'outline'}
            className="min-h-11"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-foreground">
            Comparação
            <select
              className="mt-1 min-h-11 rounded-md border border-border bg-background px-3 text-sm"
              value={selection.comparison}
              onChange={(e) =>
                setSelection((s) => ({
                  ...s,
                  comparison: e.target.value as AdaptationSelection['comparison'],
                }))
              }
            >
              <option value="week">Semana</option>
              <option value="month">Mês</option>
              <option value="quarter">Trimestre</option>
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => dashboard.reload()}
          >
            Atualizar
          </Button>
        </div>
      </section>

      {dashboard.loading && <LoadingPanel label="Carregando adaptação…" lines={5} />}
      {dashboard.message && (
        <ErrorPanel
          title="Adaptação indisponível"
          message={dashboard.message}
          onRetry={dashboard.reload}
        />
      )}

      {!dashboard.loading && !dashboard.message && dashboard.data && (
        <>
          {tab === 'dashboard' && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <section className="rounded-xl border border-border bg-card p-4">
                  <h2 className="text-base font-semibold text-foreground">Desvios</h2>
                  <p className="mt-2 text-2xl font-semibold">{dashboard.data.deviations.length}</p>
                </section>
                <section className="rounded-xl border border-border bg-card p-4">
                  <h2 className="text-base font-semibold text-foreground">Propostas</h2>
                  <p className="mt-2 text-2xl font-semibold">{dashboard.data.proposals.length}</p>
                </section>
                <section className="rounded-xl border border-border bg-card p-4">
                  <h2 className="text-base font-semibold text-foreground">Restrições</h2>
                  <p className="mt-2 text-2xl font-semibold">{dashboard.data.constraints.length}</p>
                </section>
              </div>
              <section className="rounded-xl border border-border bg-card p-4">
                <h2 className="text-base font-semibold text-foreground">Limitações</h2>
                <div className="mt-2 text-sm text-muted-foreground">
                  {dashboard.data.limitations.length ? (
                    <ul className="list-disc space-y-1 pl-5">
                      {dashboard.data.limitations.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  ) : (
                    'Nenhuma limitação adicional reportada.'
                  )}
                </div>
              </section>
              <section className="rounded-xl border border-border bg-card p-4">
                <h2 className="text-base font-semibold text-foreground">Desvios detectados</h2>
                <div className="mt-3 space-y-3">
                  {dashboard.data.deviations.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Nenhum desvio relevante detectado com os sinais disponíveis.
                    </p>
                  )}
                  {dashboard.data.deviations.map((d) => (
                    <div key={d.id} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-sm font-medium ${severityTone(d.severity)}`}>
                          {d.severity}
                        </span>
                        <span className="text-sm font-semibold text-foreground">{d.title}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{d.summary}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Observado: {d.observed}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Esperado: {d.expected}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Confiança: {d.confidence} ({d.confidenceScore})
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {tab === 'proposals' && (
            <div className="space-y-4">
              {submitMessage && (
                <ErrorPanel title="Decisão não registrada" message={submitMessage} />
              )}
              {proposals.length === 0 && (
                <EmptyState
                  title="Nenhuma proposta"
                  description="Não há propostas para o período selecionado."
                />
              )}
              {proposals.map((p) => (
                <section key={p.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-sm font-medium ${severityTone(p.severity)}`}>
                          {p.severity}
                        </span>
                        <span className="text-xs rounded border border-border px-2 py-0.5">
                          {statusLabel(p.status)}
                        </span>
                      </div>
                      <h2 className="mt-1 text-base font-semibold text-foreground">{p.title}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{p.summary}</p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                    <p>
                      <span className="text-foreground">Motivo:</span> {p.reason}
                    </p>
                    <p>
                      <span className="text-foreground">Ação recomendada:</span>{' '}
                      {p.recommendedAction}
                    </p>
                    <p>
                      <span className="text-foreground">Confiança:</span> {p.confidence} (
                      {p.confidenceScore})
                    </p>
                    <p>
                      <span className="text-foreground">Não é possível concluir:</span>{' '}
                      {p.cannotConclude.join(' ') || '—'}
                    </p>
                  </div>
                  <div className="mt-3">
                    <p className="text-sm font-medium text-foreground">Alternativas</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                      {p.alternatives.map((a) => (
                        <li key={a.id}>
                          <span className="text-foreground">{a.label}:</span> {a.description}{' '}
                          <span className="text-xs">({a.expectedEffect})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(['accept', 'reject', 'defer'] as const).map((action) => (
                      <Button
                        key={action}
                        type="button"
                        variant={action === 'accept' ? 'default' : 'outline'}
                        className="min-h-11"
                        onClick={() => {
                          setPending({ proposal: p, action });
                          setNote('');
                          setSubmitMessage(null);
                        }}
                      >
                        {action === 'accept'
                          ? 'Aceitar'
                          : action === 'reject'
                            ? 'Rejeitar'
                            : 'Adiar'}
                      </Button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {tab === 'scenarios' && (
            <div className="space-y-4">
              {scenarios.length === 0 && (
                <EmptyState
                  title="Nenhum cenário"
                  description="Sem simulações para o período selecionado."
                />
              )}
              {scenarios.map(({ proposal, simulation }) => (
                <section
                  key={simulation.id}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <p className="text-xs text-muted-foreground">{proposal.title}</p>
                  <h2 className="mt-1 text-base font-semibold text-foreground">
                    {simulation.label}
                  </h2>
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    <p>
                      <span className="text-foreground">Base:</span> {simulation.baseline}
                    </p>
                    <p>
                      <span className="text-foreground">Projetado:</span> {simulation.projected}
                    </p>
                    <p>
                      <span className="text-foreground">Delta:</span> {simulation.delta}
                    </p>
                    <p>
                      <span className="text-foreground">Confiança:</span> {simulation.confidence}
                    </p>
                  </div>
                  <div className="mt-2">
                    <p className="text-xs font-medium text-foreground">Premissas</p>
                    <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                      {simulation.assumptions.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </div>
                </section>
              ))}
            </div>
          )}

          {tab === 'history' && (
            <div className="space-y-4">
              {history.loading && <LoadingPanel label="Carregando histórico…" lines={4} />}
              {history.message && (
                <ErrorPanel
                  title="Histórico indisponível"
                  message={history.message}
                  onRetry={history.reload}
                />
              )}
              {!history.loading && !history.message && history.items.length === 0 && (
                <EmptyState
                  title="Sem histórico"
                  description="Nenhuma decisão de adaptação foi registrada ainda."
                />
              )}
              {history.items.map((item) => (
                <section
                  key={`${item.decision.proposalId}-${item.decision.version}`}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs rounded border border-border px-2 py-0.5">
                      {statusLabel(
                        item.decision.action === 'accept'
                          ? 'accepted'
                          : item.decision.action === 'reject'
                            ? 'rejected'
                            : 'deferred',
                      )}
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {item.proposal?.title ?? item.decision.proposalId}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Decidido em {item.decision.decidedAt} · versão {item.decision.version}
                  </p>
                  {item.decision.note && (
                    <p className="mt-2 text-sm text-muted-foreground">Nota: {item.decision.note}</p>
                  )}
                  {item.outcome && (
                    <div className="mt-2 rounded border border-border p-2 text-sm text-muted-foreground">
                      <p>
                        <span className="text-foreground">Acompanhamento:</span>{' '}
                        {item.outcome.observedChange}
                      </p>
                      <p className="text-xs">
                        Status: {item.outcome.status} (não prova causalidade)
                      </p>
                    </div>
                  )}
                </section>
              ))}
              {history.hasMore && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={history.loadingMore}
                  onClick={history.loadMore}
                >
                  {history.loadingMore ? 'Carregando…' : 'Carregar mais'}
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {pending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar decisão"
        >
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5">
            <h2 className="text-lg font-semibold text-foreground">Confirmar decisão</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Você está prestes a{' '}
              <span className="text-foreground font-medium">
                {pending.action === 'accept'
                  ? 'aceitar'
                  : pending.action === 'reject'
                    ? 'rejeitar'
                    : 'adiar'}
              </span>{' '}
              a proposta "{pending.proposal.title}". Nenhuma ação será executada automaticamente.
            </p>
            <label className="mt-4 block text-sm text-foreground">
              Nota (opcional)
              <textarea
                className="mt-1 min-h-24 w-full rounded-md border border-border bg-background p-3 text-sm"
                value={note}
                maxLength={1000}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            {submitMessage && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {submitMessage}
              </p>
            )}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => {
                  setPending(null);
                  setSubmitMessage(null);
                }}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="min-h-11"
                onClick={() => void confirmDecision()}
                disabled={submitting}
              >
                {submitting ? 'Registrando…' : 'Confirmar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
