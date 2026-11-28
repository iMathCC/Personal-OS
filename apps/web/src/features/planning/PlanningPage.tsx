import { Link } from 'react-router';
import { planningApi } from '@/lib/api';
import { formatMinutes, statusLabel } from './format';
import { PageHeader, ResourceView } from './ui';
import { usePlanningDashboard, usePlanningResource } from './use-planning';

export function PlanningPage() {
  const dashboard = usePlanningDashboard();
  const prioritization = usePlanningResource((signal) =>
    planningApi.prioritization(undefined, signal),
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          eyebrow="Planejamento"
          title="Priorização explicável e trade-offs"
          description="A sugestão de prioridade é determinística, documentada e separada da prioridade declarada. Nenhum valor é reescrito automaticamente; a capacidade considera apenas estimativas informadas."
        />
        <Link
          className="inline-flex min-h-11 items-center text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          to="/inteligencia"
        >
          Abrir Inteligência
        </Link>
      </div>

      <ResourceView state={prioritization}>
        {(data) => (
          <>
            <section
              aria-label="Fórmula e limitações"
              className="rounded-xl border border-border bg-card p-5"
            >
              <h3 className="text-base font-semibold">Como a sugestão é calculada</h3>
              <p className="mt-2 text-sm text-muted-foreground">{data.formula}</p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {data.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Pesos:{' '}
                {Object.entries(data.weights)
                  .map(([key, value]) => `${key} ${value}`)
                  .join(' · ')}
              </p>
            </section>

            <section
              aria-label="Capacidade da semana"
              className="rounded-xl border border-border bg-card p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold">
                  Semana de {data.capacity.weekStart} a {data.capacity.weekEnd}
                </h3>
                <Link
                  className="inline-flex min-h-11 items-center text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  to="/capacidade"
                >
                  Configurar capacidade
                </Link>
              </div>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Configurada</dt>
                  <dd>{formatMinutes(data.capacity.configuredMinutes)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Reserva + indisponibilidade</dt>
                  <dd>
                    {formatMinutes(
                      data.capacity.contingencyMinutes + data.capacity.unavailableMinutes,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Comprometida</dt>
                  <dd>{formatMinutes(data.capacity.committedMinutes)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Cobertura das estimativas</dt>
                  <dd>{Math.round(data.capacity.coverage * 100)}%</dd>
                </div>
              </dl>
              {data.capacity.warnings.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {data.capacity.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
            </section>

            <section
              aria-label="Itens priorizados"
              className="rounded-xl border border-border bg-card p-5"
            >
              <h3 className="text-base font-semibold">Metas e projetos</h3>
              {data.items.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Ainda não há metas estratégicas ou projetos elegíveis.
                </p>
              ) : (
                <div
                  tabIndex={0}
                  role="region"
                  aria-label="Tabela de priorização; use o teclado para rolar"
                  className="mt-3 overflow-x-auto focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr>
                        <th scope="col" className="py-2">
                          Item
                        </th>
                        <th scope="col" className="py-2">
                          Declarada
                        </th>
                        <th scope="col" className="py-2">
                          Sugerida
                        </th>
                        <th scope="col" className="py-2">
                          Score
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.items.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2">
                            <span className="font-medium">{item.title}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{item.kind}</span>
                            <p className="text-xs text-muted-foreground">
                              {item.reasons.map((reason) => reason.message).join(' ')}
                            </p>
                          </td>
                          <td className="py-2">{item.declaredPriority}</td>
                          <td className="py-2">{item.suggestedPriority}</td>
                          <td className="py-2">{item.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section
              aria-label="Trade-offs"
              className="rounded-xl border border-border bg-card p-5"
            >
              <h3 className="text-base font-semibold">Disputa de recursos</h3>
              {data.tradeoffs.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Nenhuma disputa detectada com os dados disponíveis.
                </p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {data.tradeoffs.map((tradeoff) => (
                    <li key={tradeoff.code} className="rounded-lg border border-border p-3">
                      <p className="font-medium">{tradeoff.title}</p>
                      <p className="mt-1 text-muted-foreground">{tradeoff.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </ResourceView>

      <ResourceView state={dashboard} loadingLabel="Carregando integração…">
        {(data) => (
          <section
            aria-label="Integração com Inteligência"
            className="rounded-xl border border-border bg-card p-5"
          >
            <h3 className="text-base font-semibold">Sinais da Inteligência</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {data.intelligence === null
                ? 'A Inteligência ainda não produziu sinais.'
                : `${data.intelligence.alerts} alerta(s), ${data.intelligence.recommendations} recomendação(ões), ${data.intelligence.sourcesWithData.length} fonte(s) com dados.`}
            </p>
            {data.currentCycle !== null && (
              <p className="mt-2 text-sm">
                Ciclo atual: {data.currentCycle.name} · {statusLabel(data.currentCycle.status)}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-x-5">
              <Link
                className="inline-flex min-h-11 items-center text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                to="/ciclos"
              >
                Ver ciclos e revisões
              </Link>
              <Link
                className="inline-flex min-h-11 items-center text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                to="/inteligencia"
              >
                Abrir Inteligência
              </Link>
            </div>
          </section>
        )}
      </ResourceView>
    </div>
  );
}
