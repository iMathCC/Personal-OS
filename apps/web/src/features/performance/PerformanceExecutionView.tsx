import type {
  PerformanceDashboardDto,
  PerformanceExecutionDto,
  PerformanceGoalEvolutionDto,
} from '@personal-os/shared';
import { EmptyState } from '@/components/states';
import { formatPercent, formatPeriod, formatValue, periodDays } from './format';
import { LimitationList, StatusBadge } from './PerformanceEvidence';

function ExecutionCard({ execution }: { execution: PerformanceExecutionDto }) {
  const consistency = execution.consistency;
  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Execução em {formatPeriod(execution.period)}</h3>
        <StatusBadge
          label={
            consistency.status === 'available' ? 'Cobertura disponível' : 'Cobertura insuficiente'
          }
          warning={consistency.status !== 'available'}
        />
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border p-3">
          <dt className="text-xs text-muted-foreground">Conclusão</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">
            {formatPercent(execution.completionRate)}
          </dd>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {execution.completedTasks} de {execution.plannedTasks} tarefas planejadas
          </p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <dt className="text-xs text-muted-foreground">Atrasadas / bloqueadas</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">
            {execution.overdueTasks} / {execution.blockedTasks}
          </dd>
        </div>
        <div className="rounded-lg border border-border p-3">
          <dt className="text-xs text-muted-foreground">Estimativa somada</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">
            {formatValue(execution.estimatedMinutes, 'min')}
          </dd>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {execution.unestimatedCount} tarefas sem estimativa
          </p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <dt className="text-xs text-muted-foreground">Tempo medido</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">
            {formatValue(execution.measuredMinutes, 'min')}
          </dd>
        </div>
      </dl>
      <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <p className="rounded-lg bg-muted/40 p-3">
          <span className="font-semibold">Capacidade declarada:</span>{' '}
          {formatValue(execution.declaredCapacityMinutes, 'min')}
        </p>
        <p className="rounded-lg bg-muted/40 p-3">
          <span className="font-semibold">Diferença estimativa − capacidade:</span>{' '}
          {formatValue(execution.capacityGapMinutes, 'min')}
        </p>
      </div>
      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        <p>
          Dias observados: {consistency.observedDays} de {periodDays(execution.period)} · dias com
          atividade: {consistency.activeDays} · cobertura {formatPercent(consistency.coverage)}
        </p>
        <p className="break-words">{consistency.note}</p>
        <p>Fonte: {execution.source}</p>
      </div>
      <div className="mt-3">
        <LimitationList items={execution.limitations} />
      </div>
      <p className="mt-3 text-[11px] text-amber-300">
        Estimativa não é tempo medido; capacidade extrapolada não é observação de execução.
      </p>
    </li>
  );
}

function GoalsCard({ goals }: { goals: PerformanceGoalEvolutionDto | null }) {
  if (goals === null) {
    return (
      <EmptyState
        eyebrow="Indisponível"
        title="Sem evolução de objetivos"
        description="A API não recebeu entidades rastreáveis no período; nada foi presumido."
      />
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">Objetivos, projetos e ciclos</h3>
      <p className="mt-1 text-xs text-muted-foreground">Janela: {formatPeriod(goals.period)}</p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div>
          <dt className="text-xs text-muted-foreground">Atualizados no período</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">{goals.advanced}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Sem atualização</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">{goals.stagnant}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Concluídos</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">{goals.completed}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Ciclos ativos</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">{goals.activeCycles}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Entidades com prazo</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">{goals.linkedEntities}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        Algoritmo: {goals.algorithmVersion}. Ausência de atualização não foi reconstruída
        retroativamente.
      </p>
      <div className="mt-3">
        <LimitationList items={goals.limitations} />
      </div>
    </div>
  );
}

export function PerformanceExecutionView({ dashboard }: { dashboard: PerformanceDashboardDto }) {
  const capacity = dashboard.domains.find((domain) => domain.id === 'time');
  return (
    <div className="space-y-8">
      <section aria-labelledby="performance-execution-title">
        <h2 id="performance-execution-title" className="text-base font-semibold">
          Planejado versus executado
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {capacity === undefined
            ? 'Sem fonte de tempo informada.'
            : `Fonte de tempo: ${capacity.source} (${capacity.recordCount} registros).`}
        </p>
        {dashboard.execution.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              eyebrow="Indisponível"
              title="Nenhuma execução consolidada"
              description="Não há execução observada para o período informado."
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-4">
            {dashboard.execution.map((execution) => (
              <ExecutionCard key={execution.period.from} execution={execution} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="performance-execution-goals-title">
        <h2 id="performance-execution-goals-title" className="text-base font-semibold">
          Objetivos e projetos
        </h2>
        <div className="mt-3">
          <GoalsCard goals={dashboard.goals} />
        </div>
      </section>

      <section aria-labelledby="performance-execution-limitations-title">
        <h2 id="performance-execution-limitations-title" className="text-base font-semibold">
          Limitações gerais
        </h2>
        <div className="mt-3">
          <LimitationList items={dashboard.limitations} />
        </div>
      </section>
    </div>
  );
}
