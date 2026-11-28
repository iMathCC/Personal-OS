import { Link } from 'react-router';
import type {
  DecisionCrossDomainDto,
  DecisionNextActionDto,
  DecisionRecommendationDto,
} from '@personal-os/shared';
import type { DecisionCatalogItem } from '@/lib/api';
import { EvidencePanel } from './EvidencePanel';
import {
  ANALYSIS_STATUS_LABELS,
  formatDuration,
  formatNumber,
  formatPercent,
  formatPriority,
  INSUFFICIENT_DATA,
  URGENCY_LABELS,
} from './format';

export interface DecisionDecisionsViewProps {
  recommendations: readonly DecisionRecommendationDto[];
  nextActions: readonly DecisionNextActionDto[];
  crossDomain: readonly DecisionCrossDomainDto[];
  catalog: readonly DecisionCatalogItem[];
}

export function DecisionDecisionsView({
  recommendations,
  nextActions,
  crossDomain,
  catalog,
}: DecisionDecisionsViewProps) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="decision-ranking-title">
        <h2 id="decision-ranking-title" className="text-base font-semibold">
          Recomendações ranqueadas
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Prioridade sugerida calculada pela API, comparada com a prioridade declarada. Nenhuma
          recomendação é executada automaticamente.
        </p>
        <ol className="mt-4 space-y-3">
          {recommendations.map((item, index) => (
            <li key={item.id} className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {index + 1}. {item.title}
                </h3>
                <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase">
                  {URGENCY_LABELS[item.urgency]} · pontuação {item.score}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{item.description}</p>
              <p className="mt-2 text-sm text-foreground/85">{item.reason}</p>
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <dt className="font-medium">Prioridade declarada</dt>
                  <dd className="text-muted-foreground">{formatPriority(item.declaredPriority)}</dd>
                </div>
                <div>
                  <dt className="font-medium">Prioridade sugerida</dt>
                  <dd className="text-muted-foreground">
                    {formatPriority(item.suggestedPriority)}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Impacto esperado</dt>
                  <dd className="text-muted-foreground">{item.expectedImpact}</dd>
                </div>
                <div>
                  <dt className="font-medium">Confiança / esforço</dt>
                  <dd className="text-muted-foreground">
                    {formatPercent(item.confidence)} · {formatDuration(item.effortMinutes)}
                  </dd>
                </div>
              </dl>
              {item.limitations.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-[11px] text-muted-foreground">
                  {item.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-foreground/85">Próximo passo: {item.nextAction}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Fontes: {item.sources.join(', ') || INSUFFICIENT_DATA} · {item.algorithmVersion}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link
                  to={`/inteligencia/alertas?alert=${encodeURIComponent(item.alertId)}`}
                  className="inline-flex min-h-11 items-center text-xs font-medium text-primary underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Ver evidência do alerta
                </Link>
                <details className="min-w-0">
                  <summary className="min-h-11 cursor-pointer text-xs font-medium text-primary focus-visible:ring-2 focus-visible:ring-ring">
                    Evidência e cálculo
                  </summary>
                  <div className="mt-2">
                    <EvidencePanel
                      explanation={item.explanation}
                      title="Evidência da recomendação"
                    />
                  </div>
                </details>
              </div>
            </li>
          ))}
        </ol>
        {recommendations.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            Nenhuma recomendação calculada com os dados disponíveis: {INSUFFICIENT_DATA}.
          </p>
        )}
      </section>

      <section aria-labelledby="decision-next-actions-title">
        <h2 id="decision-next-actions-title" className="text-base font-semibold">
          Próximas ações
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Ações sugeridas a partir de fatos e lacunas de coleta, com impacto e obstáculos
          explícitos.
        </p>
        <ul className="mt-4 space-y-3">
          {nextActions.map((action) => (
            <li key={action.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{action.title}</h3>
                <span className="text-[11px] text-muted-foreground">
                  {action.kind === 'task' ? 'Tarefa' : 'Coleta de dados'}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{action.why}</p>
              <p className="mt-2 text-xs text-foreground/85">
                Impacto esperado: {action.expectedImpact}
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Esforço {formatDuration(action.effortMinutes)} · confiança{' '}
                {formatPercent(action.confidence)}
              </p>
              {action.blockers.length > 0 && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Obstáculos: {action.blockers.join(', ')}
                </p>
              )}
              <details className="mt-2">
                <summary className="min-h-11 cursor-pointer text-xs font-medium text-primary focus-visible:ring-2 focus-visible:ring-ring">
                  Evidência da ação
                </summary>
                <div className="mt-2">
                  <EvidencePanel explanation={action.explanation} title="Evidência da ação" />
                </div>
              </details>
            </li>
          ))}
        </ul>
        {nextActions.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            Nenhuma próxima ação disponível: {INSUFFICIENT_DATA}.
          </p>
        )}
      </section>

      <section aria-labelledby="decision-cross-list-title">
        <h2 id="decision-cross-list-title" className="text-base font-semibold">
          Relações entre domínios
        </h2>
        <ul className="mt-4 space-y-3">
          {crossDomain.map((cross) => (
            <li key={cross.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{cross.label}</h3>
                <span className="text-[11px] text-muted-foreground">
                  {ANALYSIS_STATUS_LABELS[cross.status]} · confiança{' '}
                  {formatPercent(cross.confidence)}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{cross.descriptive}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Correlação {formatNumber(cross.correlation)} · causalidade: {cross.causality}
              </p>
            </li>
          ))}
        </ul>
        {crossDomain.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            Nenhuma relação estimada: {INSUFFICIENT_DATA}.
          </p>
        )}
      </section>

      <section aria-labelledby="decision-catalog-title">
        <h2 id="decision-catalog-title" className="text-base font-semibold">
          Catálogo de análises
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Critérios declarados para cada relação: nenhuma relação é inferida fora do catálogo.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {catalog.map((item) => (
            <li key={item.id} className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold">{item.label}</h3>
              <p className="mt-2 text-xs text-muted-foreground">{item.condition}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Mínimo de {formatNumber(item.minimumObservations)} observações · correlação{' '}
                {item.correlationAllowed ? 'permitida' : 'não permitida'}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Fontes: {item.sources.join(', ') || INSUFFICIENT_DATA}
              </p>
            </li>
          ))}
        </ul>
        {catalog.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            Catálogo indisponível: {INSUFFICIENT_DATA}.
          </p>
        )}
      </section>
    </div>
  );
}
