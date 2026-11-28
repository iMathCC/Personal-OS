import { EmptyState, ErrorPanel, LoadingPanel } from '@/components/states';
import { Button } from '@/components/ui/button';
import type { ReviewSectionItem, WeeklyReflections, WeeklyReviewDto } from '@personal-os/shared';
import { formatMetricValue, formatTrend, metricLabel } from '@/features/intelligence/format';
import { useReview } from './use-review';

interface ReviewPageProps {
  timezone: string;
}

const REFLECTION_FIELDS: ReadonlyArray<{
  key: keyof WeeklyReflections;
  label: string;
  placeholder: string;
}> = [
  {
    key: 'worked',
    label: 'O que funcionou',
    placeholder: 'O que deu certo nesta semana? (opcional)',
  },
  {
    key: 'didntWork',
    label: 'O que não funcionou',
    placeholder: 'O que não saiu como esperado? (opcional)',
  },
  {
    key: 'learned',
    label: 'O que aprendi',
    placeholder: 'Alguma descoberta relevante? (opcional)',
  },
  {
    key: 'change',
    label: 'O que mudar',
    placeholder: 'O que ajustar na próxima semana? (opcional)',
  },
  {
    key: 'focus',
    label: 'Foco da próxima semana',
    placeholder: 'Qual é a prioridade? (opcional)',
  },
];

const SECTION_LABELS: Record<string, string> = {
  happened: 'O que aconteceu',
  advanced: 'O que avançou',
  behind: 'O que ficou pendente',
  attention: 'O que precisa de atenção',
  next: 'Próximos passos',
};

function SectionItems({ title, items }: { title: string; items: ReviewSectionItem[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="mt-2 space-y-2">
        {items.map((item, index) => (
          <li key={`${item.code}-${index}`} className="rounded-lg border border-border bg-card p-3">
            <p className="text-sm font-medium">{item.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HistoryItem({
  review,
  active,
  onSelect,
}: {
  review: WeeklyReviewDto;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={`min-h-11 w-full rounded-md border px-3 py-2 text-left text-sm ${
          active
            ? 'border-primary bg-primary/5 text-foreground'
            : 'border-border bg-background hover:border-primary/40'
        }`}
      >
        <span className="font-medium">
          {review.weekStart} → {review.weekEnd}
        </span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          v{review.version} · {review.status} · salvo em {review.createdAt.slice(0, 10)}
        </span>
      </button>
    </li>
  );
}

export function ReviewPage({ timezone }: ReviewPageProps) {
  const review = useReview(timezone);
  const snapshot = review.snapshot;
  const isCurrent =
    review.selection.mode === 'computed' && review.selection.weekStart === review.currentWeekStart;

  return (
    <div className="space-y-8">
      <section>
        <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
          Avaliação
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Revisão semanal</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          A revisão é calculada a partir de registros reais, usando a semana local da conta (
          {timezone}). Fatos, tendências e limitações aparecem separadamente das reflexões manuais.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Semana">
          <Button
            type="button"
            variant={isCurrent ? 'default' : 'outline'}
            className="min-h-11"
            onClick={() => review.selectWeek('current')}
          >
            Semana atual
          </Button>
          <Button
            type="button"
            variant={!isCurrent && review.selection.mode === 'computed' ? 'default' : 'outline'}
            className="min-h-11"
            onClick={() => review.selectWeek('previous')}
          >
            Semana anterior
          </Button>
          {review.selection.mode === 'computed' && (
            <span className="text-xs text-muted-foreground">
              {review.selection.weekStart} → {snapshot?.weekEnd ?? ''}
            </span>
          )}
        </div>
      </section>

      {review.message !== null && (
        <ErrorPanel title="Revisão" message={review.message} onRetry={review.reload} />
      )}
      {review.status === 'loading' && <LoadingPanel label="Calculando revisão…" lines={4} />}
      {review.status === 'error' && review.message === null && (
        <ErrorPanel
          title="Revisão indisponível"
          message="Não foi possível carregar a revisão desta semana."
          onRetry={review.reload}
        />
      )}
      {review.status === 'ready' && snapshot === null && (
        <EmptyState
          eyebrow="Sem revisão"
          title="Nada para revisar"
          description="Registre atividades reais ou selecione uma revisão salva no histórico."
        />
      )}

      {snapshot !== null && (
        <>
          <section aria-labelledby="review-facts-title">
            <h3 id="review-facts-title" className="text-base font-semibold">
              Fatos da semana
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Período atual {snapshot.periods.current.from} a {snapshot.periods.current.to};
              comparação com {snapshot.periods.previous.from} a {snapshot.periods.previous.to}.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {snapshot.metrics.map((metric) => (
                <div key={metric.id} className="rounded-lg border border-border bg-card p-4">
                  <h4 className="text-xs font-medium">{metricLabel(metric)}</h4>
                  <p className="mt-1 text-lg font-semibold">{formatMetricValue(metric)}</p>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="review-sections-title" className="grid gap-5 lg:grid-cols-2">
            <div>
              <h3 id="review-sections-title" className="text-base font-semibold">
                Síntese determinística
              </h3>
              <div className="mt-4 space-y-4">
                {Object.entries(SECTION_LABELS).map(([key, label]) => (
                  <SectionItems
                    key={key}
                    title={label}
                    items={snapshot.sections[key as keyof typeof snapshot.sections]}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold">Tendências</h3>
                <ul className="mt-2 space-y-2">
                  {snapshot.trends.map((trend) => (
                    <li key={trend.id} className="rounded-lg border border-border bg-card p-3">
                      <p className="text-sm font-medium">{trend.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatTrend(trend)}</p>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Alertas e recomendações</h3>
                <ul className="mt-2 space-y-2">
                  {snapshot.alerts.map((alert) => (
                    <li key={alert.code} className="rounded-lg border border-border bg-card p-3">
                      <p className="text-sm font-medium">{alert.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{alert.explanation}</p>
                    </li>
                  ))}
                  {snapshot.recommendations.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-lg border border-primary/30 bg-primary/5 p-3"
                    >
                      <p className="text-sm font-medium">{item.action}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
                    </li>
                  ))}
                  {snapshot.alerts.length === 0 && snapshot.recommendations.length === 0 && (
                    <li className="text-xs text-muted-foreground">Nenhum alerta nos registros.</li>
                  )}
                </ul>
              </div>
            </div>
          </section>

          <section aria-labelledby="review-limitations-title">
            <h3 id="review-limitations-title" className="text-base font-semibold">
              Limitações e cobertura
            </h3>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {snapshot.coverage.sources.map((source) => (
                <li key={source.key} className="rounded-lg border border-border bg-card p-3">
                  <p className="text-sm font-medium">{source.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {source.recordCount} registros · {Math.round(source.coverageRatio * 100)}% de
                    cobertura
                  </p>
                </li>
              ))}
            </ul>
            {snapshot.limitations.length > 0 && (
              <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-muted-foreground">
                {snapshot.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
            {snapshot.coverage.unconnectedAreas.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Sem fonte conectada: {snapshot.coverage.unconnectedAreas.join(', ')}.
              </p>
            )}
          </section>

          <section
            aria-labelledby="reflections-title"
            className="rounded-xl border border-border bg-card p-5"
          >
            <h3 id="reflections-title" className="text-base font-semibold">
              Reflexões pessoais
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Opcionais e privadas. Ao salvar, o snapshot acima é congelado: editar reflexões não
              recalcula os números nem apaga a revisão original.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {REFLECTION_FIELDS.map((field) => (
                <label key={field.key} className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium">{field.label}</span>
                  <textarea
                    value={review.reflections[field.key] ?? ''}
                    onChange={(event) => review.setReflection(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    rows={3}
                    maxLength={2000}
                    className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {review.saved === null ? (
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={review.busy || review.selection.mode !== 'computed'}
                  onClick={() => void review.save()}
                >
                  Salvar revisão
                </Button>
              ) : (
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={review.busy}
                  onClick={() => void review.update()}
                >
                  Atualizar reflexões (v{review.saved.version})
                </Button>
              )}
              {review.saved !== null && (
                <span className="text-xs text-muted-foreground">
                  Snapshot de {review.saved.snapshot.generatedAt.slice(0, 10)} · versão{' '}
                  {review.saved.version}
                </span>
              )}
            </div>
          </section>
        </>
      )}

      <section aria-labelledby="review-history-title">
        <h3 id="review-history-title" className="text-base font-semibold">
          Histórico salvo
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Revisões antigas conservam o snapshot original, mesmo após atualizações nas reflexões.
        </p>
        {review.history.items.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nenhuma revisão salva ainda.</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {review.history.items.map((item) => (
              <HistoryItem
                key={item.id}
                review={item}
                active={review.selection.mode === 'saved' && review.selection.id === item.id}
                onSelect={() => review.selectSaved(item.id)}
              />
            ))}
          </ul>
        )}
        {review.history.hasMore && (
          <Button
            type="button"
            variant="outline"
            className="mt-4 min-h-11"
            disabled={review.historyLoadingMore}
            onClick={review.loadHistoryMore}
          >
            {review.historyLoadingMore ? 'Carregando…' : 'Carregar mais'}
          </Button>
        )}
      </section>
    </div>
  );
}
