import type {
  PerformanceAssociationDto,
  PerformanceDashboardDto,
  PerformancePatternDto,
  PerformanceProjectionDto,
} from '@personal-os/shared';
import { EmptyState } from '@/components/states';
import {
  ASSOCIATION_RELATION_LABELS,
  formatConfidence,
  formatPercent,
  formatPeriod,
  formatValue,
  PATTERN_STATUS_LABELS,
} from './format';
import { LimitationList, StatusBadge } from './PerformanceEvidence';

function PatternCard({ pattern }: { pattern: PerformancePatternDto }) {
  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{pattern.label}</h3>
        <StatusBadge
          label={PATTERN_STATUS_LABELS[pattern.status]}
          warning={pattern.status !== 'identified'}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{pattern.evidence}</p>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Classificação</dt>
          <dd className="mt-0.5 font-semibold">{pattern.classification}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Forma</dt>
          <dd className="mt-0.5 font-semibold">{pattern.shape}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Observações / passos</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            {pattern.observations} / {pattern.recurrentSteps}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Confiança</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            {formatConfidence(pattern.confidence)}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Janela {formatPeriod(pattern.window)} · fonte {pattern.source} · causalidade:{' '}
        {pattern.causality}.
      </p>
      <div className="mt-3">
        <LimitationList items={pattern.limitations} />
      </div>
    </li>
  );
}

function AssociationCard({ association }: { association: PerformanceAssociationDto }) {
  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{association.label}</h3>
        <StatusBadge
          label={ASSOCIATION_RELATION_LABELS[association.relation]}
          warning={association.status !== 'ok'}
        />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {association.descriptive}
      </p>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Correlação</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            {association.correlation === null ? 'não estimada' : association.correlation.toFixed(3)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Pontos pareados</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">{association.pairedPoints}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Cobertura</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            {formatPercent(association.coverage)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Confiança</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            {formatPercent(association.confidence)}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-[11px] text-amber-300">
        Relação descritiva; causalidade não afirmada ({association.causality}).
      </p>
      <div className="mt-3">
        <LimitationList items={association.limitations} />
      </div>
    </li>
  );
}

function ProjectionCard({ projection }: { projection: PerformanceProjectionDto }) {
  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{projection.label}</h3>
        <StatusBadge label="Simulação" warning />
      </div>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Valor simulado</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            {formatValue(projection.projectedValue, projection.unit)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Horizonte</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">{projection.horizonDays} dias</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Pontos usados</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">{projection.dataPoints}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Método</dt>
          <dd className="mt-0.5 font-semibold break-words">{projection.method}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        {projection.reason ?? 'Simulação disponível.'}
      </p>
      <div className="mt-3">
        <p className="text-xs font-semibold">Premissas</p>
        <ul className="list-inside list-disc text-xs text-muted-foreground">
          {projection.assumptions.map((assumption) => (
            <li key={assumption} className="break-words">
              {assumption}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-2 text-[11px] text-amber-300">
        Resultado classificado como {projection.classification}; não é previsão nem recomendação.
      </p>
      <div className="mt-3">
        <LimitationList items={projection.limitations} />
      </div>
    </li>
  );
}

export function PerformancePatternsView({ dashboard }: { dashboard: PerformanceDashboardDto }) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="performance-patterns-title">
        <h2 id="performance-patterns-title" className="text-base font-semibold">
          Padrões com amostra mínima
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Padrões só são exibidos quando a amostra atinge o mínimo do algoritmo. Hipóteses não são
          fatos.
        </p>
        {dashboard.patterns.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              eyebrow="Inconclusivo"
              title="Nenhum padrão identificado"
              description="A amostra observada não atinge o mínimo ou não apresenta repetição suficiente."
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-4">
            {dashboard.patterns.map((pattern) => (
              <PatternCard key={pattern.id} pattern={pattern} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="performance-associations-title">
        <h2 id="performance-associations-title" className="text-base font-semibold">
          Associações entre domínios
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Nenhuma relação é apresentada como causal; ausência de amostra permanece indisponível.
        </p>
        {dashboard.associations.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              eyebrow="Indisponível"
              title="Sem associações calculadas"
              description="Não há pares observados suficientes para descrever relações entre domínios."
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-4">
            {dashboard.associations.map((association) => (
              <AssociationCard key={association.id} association={association} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="performance-projections-title">
        <h2 id="performance-projections-title" className="text-base font-semibold">
          Cenários e projeções
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Toda projeção é uma simulação determinística com premissas explícitas e nenhuma decisão
          automática.
        </p>
        {dashboard.projections.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              eyebrow="Indisponível"
              title="Sem simulações disponíveis"
              description="Não há pontos observados suficientes para construir um cenário transparente."
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-4">
            {dashboard.projections.map((projection) => (
              <ProjectionCard key={projection.id} projection={projection} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="performance-patterns-limitations-title">
        <h2 id="performance-patterns-limitations-title" className="text-base font-semibold">
          Limitações do painel
        </h2>
        <div className="mt-3">
          <LimitationList items={dashboard.limitations} />
        </div>
      </section>
    </div>
  );
}
