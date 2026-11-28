import { useState } from 'react';
import { EmptyState, ErrorPanel, LoadingPanel } from '@/components/states';
import type { DecisionReviewDto } from '@personal-os/shared';
import { DecisionPageHeader } from './DecisionPageHeader';
import { DecisionPeriodFilter, type DecisionPeriodSelection } from './DecisionPeriodFilter';
import { DecisionReviewsView } from './DecisionReviewsView';
import { useDecisionReviews } from './use-decision';

const KINDS: readonly DecisionReviewDto['kind'][] = ['weekly', 'monthly', 'quarterly'];

export function DecisionReviewsPage() {
  const [kind, setKind] = useState<DecisionReviewDto['kind']>('weekly');
  const [period, setPeriod] = useState<DecisionPeriodSelection>({
    comparison: undefined,
    from: '',
    to: '',
  });
  const review = useDecisionReviews(
    kind,
    period.comparison,
    period.from === '' ? undefined : period.from,
    period.to === '' ? undefined : period.to,
  );

  return (
    <div className="space-y-8">
      <DecisionPageHeader
        eyebrow="Camada de decisão"
        title="Revisões de desempenho"
        description="Revisões semanais, mensais e trimestrais com observações, valores calculados e lacunas separados. A indicação de snapshot distingue o que foi persistido do que foi apenas calculado."
      >
        <p className="mt-3 text-xs text-muted-foreground">
          Tipos disponíveis: {KINDS.join(', ')}. As revisões não executam recomendação alguma.
        </p>
      </DecisionPageHeader>
      <DecisionPeriodFilter value={period} onChange={setPeriod} />

      {review.loading && <LoadingPanel label="Carregando revisão de desempenho…" lines={4} />}
      {review.message !== null && (
        <ErrorPanel title="Revisão indisponível" message={review.message} onRetry={review.reload} />
      )}
      {!review.loading && review.message === null && review.data === null && (
        <EmptyState
          eyebrow="Sem dados"
          title="Nenhuma revisão disponível"
          description="A consulta não respondeu para este tipo de revisão. Nenhum valor foi preenchido automaticamente."
        />
      )}
      {review.data !== null && <DecisionReviewsView review={review.data} onKindChange={setKind} />}
    </div>
  );
}
