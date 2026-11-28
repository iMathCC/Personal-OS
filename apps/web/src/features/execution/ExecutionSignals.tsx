import type { ExecutionDashboardData, ExecutionRiskDto } from '@personal-os/shared';
import { Link } from 'react-router';
import { EmptyState } from '@/components/states';
import { Icon } from '@/components/icons';
import { activityLabel, formatLocalDate } from '@/features/projects/format';
import { riskKindLabel, severityLabel } from './format';

const linkClass =
  'inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm text-foreground hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring';

function RiskItem({ risk }: { risk: ExecutionRiskDto }) {
  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{risk.title}</p>
        <span className="text-xs text-muted-foreground">
          {riskKindLabel(risk.kind)} · {severityLabel(risk.severity)} ·{' '}
          {formatLocalDate(risk.dueDate)}
        </span>
      </div>
      <ul className="mt-2 space-y-1">
        {risk.reasons.map((reason) => (
          <li key={reason} className="text-xs text-muted-foreground">
            {reason}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted-foreground">Regra {risk.algorithmVersion}</p>
    </li>
  );
}

interface ExecutionSignalsProps {
  data: ExecutionDashboardData;
  /** Na visão geral, mostra apenas o essencial; a página /execucao é completa. */
  compact?: boolean;
}

export function ExecutionSignals({ data, compact = false }: ExecutionSignalsProps) {
  const signals = data.signals;
  const next = data.nextAction;

  return (
    <div className="space-y-4">
      {!compact && (
        <p className="text-xs text-muted-foreground">
          Data local {formatLocalDate(data.date)} · fuso {data.timezone} · sinais calculados às{' '}
          {data.generatedAt.replace('T', ' ').replace(/\.\d+Z$/u, ' UTC')}. Nenhuma recomendação é
          executada automaticamente.
        </p>
      )}

      <section aria-label="Sinais de execução">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <li className="rounded-lg border border-border bg-card p-3">
            <span className="block text-xs text-muted-foreground">Projetos ativos</span>
            <span className="block text-lg font-semibold tabular-nums">
              {signals.activeProjects}
            </span>
          </li>
          <li className="rounded-lg border border-border bg-card p-3">
            <span className="block text-xs text-muted-foreground">Tarefas executáveis</span>
            <span className="block text-lg font-semibold tabular-nums">
              {signals.executableTasks}
            </span>
          </li>
          <li className="rounded-lg border border-border bg-card p-3">
            <span className="block text-xs text-muted-foreground">Tarefas atrasadas</span>
            <span className="block text-lg font-semibold tabular-nums">{signals.overdueTasks}</span>
          </li>
          <li className="rounded-lg border border-border bg-card p-3">
            <span className="block text-xs text-muted-foreground">Tarefas bloqueadas</span>
            <span className="block text-lg font-semibold tabular-nums">{signals.blockedTasks}</span>
          </li>
          {!compact && (
            <>
              <li className="rounded-lg border border-border bg-card p-3">
                <span className="block text-xs text-muted-foreground">Vencem hoje</span>
                <span className="block text-lg font-semibold tabular-nums">{signals.dueToday}</span>
              </li>
              <li className="rounded-lg border border-border bg-card p-3">
                <span className="block text-xs text-muted-foreground">Concluídas hoje</span>
                <span className="block text-lg font-semibold tabular-nums">
                  {signals.completedTasksToday}
                </span>
              </li>
              <li className="rounded-lg border border-border bg-card p-3">
                <span className="block text-xs text-muted-foreground">Marcos atrasados</span>
                <span className="block text-lg font-semibold tabular-nums">
                  {signals.overdueMilestones}
                </span>
              </li>
              <li className="rounded-lg border border-border bg-card p-3">
                <span className="block text-xs text-muted-foreground">Projetos parados</span>
                <span className="block text-lg font-semibold tabular-nums">
                  {signals.stalledProjects}
                </span>
              </li>
            </>
          )}
        </ul>
        {data.truncated && (
          <p role="status" className="mt-2 text-xs font-medium text-amber-300">
            Resultado parcial: o servidor atingiu o limite de leitura.
          </p>
        )}
      </section>

      <section aria-label="Próxima ação">
        <h3 className="text-sm font-semibold">Próxima ação indicada pela regra</h3>
        {next === null ? (
          <div className="mt-2">
            <EmptyState
              eyebrow="Sem sinal"
              title="Nenhuma próxima ação calculada"
              description="Não havia tarefa elegível na consulta. Nenhuma ação é sugerida sem dado real."
            />
          </div>
        ) : (
          <div className="mt-2 rounded-lg border border-primary/40 bg-primary/5 p-4">
            <p className="text-sm font-medium">{next.taskTitle}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {next.projectTitle ?? 'Sem projeto'} · prioridade {next.priority} ·{' '}
              {formatLocalDate(next.dueDate)} · pontuação {next.score}
            </p>
            <p className="mt-2 text-sm leading-relaxed">{next.explanation}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Motivos: {next.reasonCodes.join(', ') || 'sem código adicional'} · regra{' '}
              {next.algorithmVersion}
            </p>
            <Link to={`/tarefas?taskId=${next.taskId}`} className={`${linkClass} mt-3`}>
              Abrir tarefa indicada
              <Icon name="arrow" size={15} />
            </Link>
          </div>
        )}
      </section>

      {!compact && (
        <>
          <section aria-labelledby="execution-risks-title">
            <h3 id="execution-risks-title" className="text-sm font-semibold">
              Riscos registrados ({data.risks.length})
            </h3>
            {data.risks.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Nenhum risco calculado para os dados consultados.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-card">
                {data.risks.map((risk) => (
                  <RiskItem key={`${risk.kind}:${risk.entityId}`} risk={risk} />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="execution-projects-title">
            <h3 id="execution-projects-title" className="text-sm font-semibold">
              Projetos ({data.projects.length})
            </h3>
            {data.projects.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Nenhum projeto considerado nesta consulta.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-card">
                {data.projects.map((project) => (
                  <li key={project.id} className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{project.title}</p>
                      <span className="text-xs text-muted-foreground">
                        {activityLabel(project.activityState)} ·{' '}
                        {project.daysSinceActivity === null
                          ? 'sem registro de atividade'
                          : `${project.daysSinceActivity} dia(s) desde a última atividade`}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Progresso:{' '}
                      {project.progress.percent === null
                        ? 'Sem dados'
                        : `${project.progress.percent}%`}{' '}
                      · base {project.progress.basis}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Algoritmos: progresso {data.algorithms.progress} · atividade{' '}
              {data.algorithms.activity} · bloqueio {data.algorithms.blocking} · próxima ação{' '}
              {data.algorithms.nextAction} · risco {data.algorithms.risk}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
