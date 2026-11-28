import type {
  DecisionReviewDto,
  PerformanceDashboardDto,
  PerformanceSnapshotDto,
} from '@personal-os/shared';
import { EmptyState } from '@/components/states';
import { COMPLETENESS_LABELS, formatConfidence, formatPeriod, REVIEW_KIND_LABELS } from './format';
import { LimitationList, StatusBadge } from './PerformanceEvidence';

const REVIEW_KIND_LABEL: Record<DecisionReviewDto['kind'], string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
};

function ReviewPanel({ review }: { review: DecisionReviewDto }) {
  const explanation = review.explanation;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Revisão {REVIEW_KIND_LABEL[review.kind]} · {formatPeriod(review.period)}
        </h3>
        <StatusBadge
          label={review.persistedSnapshot ? 'Snapshot persistido' : 'Consolidação sob demanda'}
          warning={!review.persistedSnapshot}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Comparada com {formatPeriod(review.previous)} · confiança{' '}
        {formatConfidence(explanation.confidence)} · {explanation.algorithmVersion}
      </p>
      <div className="mt-3 space-y-3">
        {review.sections.map((section) => (
          <section key={section.title} aria-label={section.title}>
            <h4 className="text-xs font-semibold">{section.title}</h4>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
              {section.items.map((item) => (
                <li key={`${item.label}-${item.value}`} className="break-words">
                  {item.label}: {item.value} ({item.kind})
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
        <p className="break-words">
          <span className="font-semibold text-foreground/80">Identificado:</span>{' '}
          {explanation.identified}
        </p>
        <p className="break-words">
          <span className="font-semibold text-foreground/80">Cálculo:</span>{' '}
          {explanation.calculation}
        </p>
        <p className="break-words">
          <span className="font-semibold text-foreground/80">Não é possível concluir:</span>{' '}
          {explanation.cannotConclude}
        </p>
        <p>Dados usados: {explanation.dataUsed.join(', ') || 'nenhum'}.</p>
        <p>Ausentes: {explanation.missing.join(', ') || 'nenhum'}.</p>
        <p>Fontes: {explanation.sources.join(', ') || 'nenhuma'}.</p>
      </div>
      <div className="mt-3">
        <LimitationList items={review.limitations} />
      </div>
    </div>
  );
}

function SnapshotPanel({ snapshot }: { snapshot: PerformanceSnapshotDto }) {
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Snapshot {snapshot.id}</h3>
        <StatusBadge
          label={snapshot.persistedSnapshot ? 'Persistido' : 'Sob demanda'}
          warning={!snapshot.persistedSnapshot}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {REVIEW_KIND_LABELS[snapshot.kind]} · {formatPeriod(snapshot.period)} · criado em{' '}
        {snapshot.createdAt} · imutável: {String(snapshot.immutable)}
      </p>
      <div className="mt-3 space-y-3">
        {snapshot.sections.map((section) => (
          <section key={section.title} aria-label={section.title}>
            <h4 className="text-xs font-semibold">{section.title}</h4>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
              {section.items.map((item, index) => (
                <li key={`${item.label}-${index}`} className="break-words">
                  {item.label}: {item.value} ({item.kind})
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Algoritmo: {snapshot.algorithmVersion}. Snapshots encerrados não são recalculados.
      </p>
    </div>
  );
}

export function PerformanceReviewsView({ dashboard }: { dashboard: PerformanceDashboardDto }) {
  const algorithms = Object.entries(dashboard.algorithms).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="space-y-8">
      <section aria-labelledby="performance-reviews-period-title">
        <h2 id="performance-reviews-period-title" className="text-base font-semibold">
          Consolidação solicitada
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Corrente: {formatPeriod(dashboard.periods.current)} (
          {COMPLETENESS_LABELS[dashboard.periods.currentCompleteness] ?? 'Não informado'}) ·
          anterior: {formatPeriod(dashboard.periods.previous)} (
          {COMPLETENESS_LABELS[dashboard.periods.previousCompleteness] ?? 'Não informado'}).
        </p>
        <div className="mt-2">
          <LimitationList items={dashboard.periods.limitations} />
        </div>
      </section>

      <section aria-labelledby="performance-reviews-review-title">
        <h2 id="performance-reviews-review-title" className="text-base font-semibold">
          Revisão de desempenho
        </h2>
        <div className="mt-3">
          {dashboard.review === null ? (
            <EmptyState
              eyebrow="Indisponível"
              title="Sem revisão consolidada"
              description="A API não retornou revisão para o período solicitado."
            />
          ) : (
            <ReviewPanel review={dashboard.review} />
          )}
        </div>
      </section>

      <section aria-labelledby="performance-reviews-snapshot-title">
        <h2 id="performance-reviews-snapshot-title" className="text-base font-semibold">
          Snapshot longitudinal
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          O identificador é estável para o mesmo conteúdo; nenhuma versão antiga é sobrescrita.
        </p>
        <div className="mt-3">
          {dashboard.snapshot === null ? (
            <EmptyState
              eyebrow="Indisponível"
              title="Sem snapshot"
              description="Não foi possível consolidar um snapshot para o período informado."
            />
          ) : (
            <SnapshotPanel snapshot={dashboard.snapshot} />
          )}
        </div>
      </section>

      <section aria-labelledby="performance-reviews-algorithms-title">
        <h2 id="performance-reviews-algorithms-title" className="text-base font-semibold">
          Versões dos algoritmos
        </h2>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {algorithms.map(([name, version]) => (
            <div key={name} className="rounded-lg border border-border bg-card p-3">
              <dt className="text-xs text-muted-foreground">{name}</dt>
              <dd className="mt-0.5 text-xs font-semibold break-words">{version}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="performance-reviews-limitations-title">
        <h2 id="performance-reviews-limitations-title" className="text-base font-semibold">
          Limitações gerais
        </h2>
        <div className="mt-3">
          <LimitationList items={dashboard.limitations} />
        </div>
      </section>
    </div>
  );
}
