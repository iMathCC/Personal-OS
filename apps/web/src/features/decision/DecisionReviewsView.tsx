import type { DecisionReviewDto } from '@personal-os/shared';
import { EvidencePanel } from './EvidencePanel';
import {
  COMPARISON_STATUS_LABELS,
  formatNumber,
  formatPercent,
  formatPeriod,
  INSUFFICIENT_DATA,
  REVIEW_ITEM_KIND_LABELS,
  REVIEW_KIND_LABELS,
} from './format';

export interface DecisionReviewsViewProps {
  review: DecisionReviewDto;
  onKindChange: (kind: DecisionReviewDto['kind']) => void;
}

const KINDS: readonly DecisionReviewDto['kind'][] = ['weekly', 'monthly', 'quarterly'];

export function DecisionReviewsView({ review, onKindChange }: DecisionReviewsViewProps) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="decision-review-kind-title">
        <h2 id="decision-review-kind-title" className="text-base font-semibold">
          Tipo de revisão
        </h2>
        <div role="group" aria-label="Tipo de revisão" className="mt-3 flex flex-wrap gap-2">
          {KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={review.kind === kind}
              onClick={() => onKindChange(kind)}
              className={`min-h-11 rounded-md border px-4 text-sm focus-visible:ring-2 focus-visible:ring-ring ${
                review.kind === kind
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground'
              }`}
            >
              {REVIEW_KIND_LABELS[kind]}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="decision-review-period-title">
        <h2 id="decision-review-period-title" className="text-base font-semibold">
          {REVIEW_KIND_LABELS[review.kind]} · {formatPeriod(review.period)}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Período anterior: {formatPeriod(review.previous)}.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {review.persistedSnapshot
            ? 'Snapshot persistido: esta revisão foi registrada na API.'
            : 'Sem snapshot persistido: resultado apenas calculado nesta consulta.'}
        </p>
      </section>

      <section aria-labelledby="decision-review-sections-title">
        <h2 id="decision-review-sections-title" className="text-base font-semibold">
          Seções da revisão
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Observações, cálculos e ausências são apresentados com origens distintas.
        </p>
        <div className="mt-4 space-y-4">
          {review.sections.map((section) => (
            <article key={section.title} className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold">{section.title}</h3>
              <ul className="mt-3 space-y-2">
                {section.items.map((item, index) => (
                  <li
                    key={`${item.label}-${index}`}
                    className="rounded-md border border-border/70 bg-background/60 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-medium">{item.label}</h4>
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                          item.kind === 'insufficient'
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-muted text-foreground/80'
                        }`}
                      >
                        {REVIEW_ITEM_KIND_LABELS[item.kind]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.value || INSUFFICIENT_DATA}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Fontes: {item.sources.join(', ') || INSUFFICIENT_DATA}
                    </p>
                  </li>
                ))}
              </ul>
              {section.items.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Sem itens disponíveis: {INSUFFICIENT_DATA}.
                </p>
              )}
            </article>
          ))}
        </div>
        {review.sections.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            Nenhuma seção calculada: {INSUFFICIENT_DATA}.
          </p>
        )}
      </section>

      <section aria-labelledby="decision-review-comparisons-title">
        <h2 id="decision-review-comparisons-title" className="text-base font-semibold">
          Comparações
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {review.comparisons.map((comparison) => (
            <li key={comparison.metric} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{comparison.metric}</h3>
                <span className="text-[11px] text-muted-foreground">
                  {COMPARISON_STATUS_LABELS[comparison.status]}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Atual {formatNumber(comparison.current)} · anterior{' '}
                {formatNumber(comparison.previous)} · variação {formatNumber(comparison.delta)} ·
                percentual {formatPercent(comparison.changePercent)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Cobertura {formatPercent(comparison.coverage)}
              </p>
              {comparison.limitations.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-[11px] text-muted-foreground">
                  {comparison.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {review.comparisons.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            Nenhuma comparação disponível: {INSUFFICIENT_DATA}.
          </p>
        )}
      </section>

      <section aria-labelledby="decision-review-limits-title" className="space-y-4">
        <h2 id="decision-review-limits-title" className="text-base font-semibold">
          Limitações e evidência
        </h2>
        <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
          {review.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
        <EvidencePanel explanation={review.explanation} title="Evidência da revisão" />
        <p className="text-[11px] text-muted-foreground">
          Versão do algoritmo: {review.algorithmVersion}
        </p>
      </section>
    </div>
  );
}
