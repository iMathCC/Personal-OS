import { lifeApi } from '@/lib/api';
import { Limitations, Metric, PageHeader, PeriodControls, SummaryView } from './shared';
import { formatRatio, useDefaultPeriod, useLifeResource } from './shared-helpers';

export function IntegrationPage() {
  const [period, setPeriod] = useDefaultPeriod();
  const dashboard = useLifeResource(
    (signal) => lifeApi.dashboard(period, signal),
    [period.from, period.to],
  );
  const integration = useLifeResource(
    (signal) => lifeApi.integration(period, signal),
    [period.from, period.to],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Áreas da vida · integração"
        title="Integração rastreável"
        description="Relações explícitas entre áreas, com fontes, limites e algoritmos versionados. Correlação temporal não é apresentada como causalidade."
      />
      <PeriodControls period={period} onChange={setPeriod} />
      <SummaryView state={integration}>
        {(data) => (
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Fontes com dados" value={String(data.sources.length)} />
              <Metric label="Observações" value={String(data.observationCount)} />
              <Metric label="Cobertura diária" value={formatRatio(data.coverage.coverageRatio)} />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Algoritmo: {data.algorithmVersion} · fontes: {data.sources.join(', ') || 'nenhuma'}
            </p>
            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              {data.relations.map((relation) => (
                <div
                  key={relation.id}
                  className="rounded-lg border border-border bg-background/60 p-4"
                >
                  <p className="text-sm font-semibold">{relation.id}</p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {relation.description}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Fontes: {relation.sources.join(' + ')} · {relation.observationCount}{' '}
                    observação(ões)
                  </p>
                  <p className="mt-2 text-xs text-amber-300">Limite: {relation.limitation}</p>
                </div>
              ))}
            </div>
            <Limitations items={data.limitations} />
          </div>
        )}
      </SummaryView>

      <SummaryView state={dashboard}>
        {(data) => (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-lg font-semibold">Domínios modelados</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Cada domínio possui tabela própria, colunas tipadas e proveniência comum.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.domains.map((domain) => (
                <div key={domain.domain} className="rounded-lg border border-border p-3 text-xs">
                  <p className="font-medium">{domain.label}</p>
                  <p className="mt-1 text-muted-foreground">
                    {domain.recordCount} registro(s) · {domain.domain}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </SummaryView>
    </div>
  );
}
