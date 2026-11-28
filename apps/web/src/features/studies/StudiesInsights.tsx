import type { GoalDto, StudiesDashboardData } from '@personal-os/shared';
import { LazyChart } from '@/components/charts/LazyChart';
import { EmptyState } from '@/components/states';
import { comparisonOption, evolutionOption } from '@/components/charts/chart-options';
import { formatDelta, formatMinutes, goalBasisLabel } from './format';

interface StudiesInsightsProps {
  dashboard: StudiesDashboardData;
}

function compliance(goals: readonly GoalDto[]): string {
  const values = goals
    .map((goal) => goal.progress.percent)
    .filter((value): value is number => value !== null);
  if (values.length === 0) return '—';
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return `${average.toFixed(0)}%`;
}

function GoalCard({ goal }: { goal: GoalDto }) {
  const { percent } = goal.progress;
  const history = goal.progressSeries.filter(
    (point) => point.value !== null && point.sampleCount > 0,
  );
  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{goal.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {goal.startDate} → {goal.targetDate} · meta de {formatMinutes(goal.targetMinutes)}
          </p>
        </div>
        <span className="rounded-full border border-border px-2 py-1 text-xs tabular-nums">
          {percent === null ? 'sem dados' : `${percent}%`}
        </span>
      </div>
      {percent === null ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Progresso indisponível: {goalBasisLabel(goal.progress.basis)}.
        </p>
      ) : (
        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={`Progresso da meta ${goal.title}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{goalBasisLabel(goal.progress.basis)}</p>
      {goal.progress.truncated && (
        <p role="status" className="mt-1 text-xs font-medium text-amber-300">
          Progresso parcial: limite de 10.000 observações atingido.
        </p>
      )}
      {history.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring">
            Histórico de evolução
          </summary>
          <ul className="mt-2 space-y-1 tabular-nums">
            {history.slice(-7).map((point) => (
              <li key={point.date} className="flex justify-between gap-3">
                <span>{point.date}</span>
                <span>{formatMinutes(point.value ?? 0)} no dia</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

export function StudiesInsights({ dashboard }: StudiesInsightsProps) {
  const hasSeries = dashboard.series.some((point) => point.value !== null);
  const hasGoalData = dashboard.goals.length > 0;
  return (
    <>
      <section aria-label="Resumo do período">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Minutos estudados', value: formatMinutes(dashboard.summary.totalMinutes) },
            { label: 'Sessões', value: String(dashboard.summary.sessionCount) },
            { label: 'Dias com estudo', value: String(dashboard.summary.daysStudied) },
            { label: 'Cumprimento de metas', value: compliance(dashboard.goals) },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-border bg-card p-4">
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          Período de {dashboard.period.from} a {dashboard.period.to} no fuso{' '}
          {dashboard.period.timezone}.
        </p>
        {dashboard.truncated && (
          <p role="status" className="mt-2 text-xs font-medium text-amber-300">
            Dados parciais: o período excede o limite de 10.000 observações e pode omitir sessões
            recentes.
          </p>
        )}
      </section>

      <section aria-label="Comparação com o período anterior">
        <h3 className="text-base font-semibold">Comparação com o período anterior</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Minutos', value: formatDelta(dashboard.comparison.totalMinutes) },
            { label: 'Sessões', value: formatDelta(dashboard.comparison.sessionCount) },
            { label: 'Dias estudados', value: formatDelta(dashboard.comparison.daysStudied) },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-border bg-card p-4">
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="mt-1 text-sm font-medium tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          Base: {dashboard.period.previousFrom} a {dashboard.period.previousTo}.
        </p>
      </section>

      {hasSeries ? (
        <section className="grid gap-4 lg:grid-cols-2" aria-label="Evolução dos estudos">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">Evolução diária</h3>
            <LazyChart
              option={evolutionOption(dashboard)}
              ariaLabel="Gráfico de minutos estudados por dia no período selecionado"
            />
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">Período atual x anterior</h3>
            <LazyChart
              option={comparisonOption(dashboard)}
              ariaLabel="Gráfico de comparação dos minutos estudados entre o período atual e o anterior"
            />
          </div>
        </section>
      ) : (
        <EmptyState
          eyebrow="Sem dados"
          title="Ainda não há evolução para este filtro"
          description="Os gráficos aparecem quando existir pelo menos uma sessão registrada no período."
        />
      )}

      <section aria-labelledby="by-course-title">
        <h3 id="by-course-title" className="text-base font-semibold">
          Tempo por curso
        </h3>
        {dashboard.byCourse.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="Nenhum curso com registro no período"
              description="Associe sessões a um curso para comparar o tempo investido."
            />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
            {dashboard.byCourse.map((row) => (
              <li
                key={row.courseId ?? '__none__'}
                className="flex justify-between gap-3 p-4 text-sm"
              >
                <span>{row.title ?? 'Sem curso'}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatMinutes(row.minutes)} · {row.sessionCount} sessões
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="goals-title">
        <h3 id="goals-title" className="text-base font-semibold">
          Metas de estudo
        </h3>
        {hasGoalData ? (
          <ul className="mt-3 grid gap-3 lg:grid-cols-2">
            {dashboard.goals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} />
            ))}
          </ul>
        ) : (
          <div className="mt-3">
            <EmptyState
              title="Nenhuma meta cadastrada"
              description="Crie uma meta com período e alvo em minutos para acompanhar o cumprimento."
            />
          </div>
        )}
      </section>
    </>
  );
}
