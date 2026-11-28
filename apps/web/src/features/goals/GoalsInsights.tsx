import type { GoalDashboardData } from '@personal-os/shared';
import { LazyChart } from '@/components/charts/LazyChart';
import { EmptyState } from '@/components/states';
import { attentionOption, areaProgressOption } from './goals-chart-options';
import { attentionLabel, formatGoalDate, formatPercent, statusLabel } from './format';

interface GoalsInsightsProps {
  dashboard: GoalDashboardData;
}

export function GoalsInsights({ dashboard }: GoalsInsightsProps) {
  const hasAreas = dashboard.byArea.some((area) => area.active > 0);
  const hasAttention = dashboard.attention.length > 0;

  return (
    <div className="space-y-6">
      <section aria-label="Resumo de objetivos">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Ativos', value: String(dashboard.summary.active) },
            { label: 'Concluídos', value: String(dashboard.summary.achieved) },
            { label: 'Com prazo vencido', value: String(dashboard.summary.overdue) },
            {
              label: 'Progresso médio conhecido',
              value: formatPercent(dashboard.progress.overall),
            },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-border bg-card p-4">
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          Data de referência {formatGoalDate(dashboard.date)} · fuso {dashboard.timezone} ·{' '}
          {dashboard.progress.knownCount} de {dashboard.progress.activeCount} objetivos ativos com
          progresso conhecido.
        </p>
        {dashboard.truncated === true && (
          <p role="status" className="mt-2 text-xs font-medium text-amber-300">
            Leitura parcial: parte dos objetivos não entrou nesta consolidação.
          </p>
        )}
      </section>

      <section aria-label="Fatos registrados">
        <h3 className="text-base font-semibold">Fatos registrados</h3>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <h4 className="text-sm font-semibold">Prazos próximos</h4>
            {dashboard.deadlines.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">Nenhum prazo registrado.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {dashboard.deadlines.map((item) => (
                  <li key={item.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                    <span>{item.title}</span>
                    <span className="text-muted-foreground">{formatGoalDate(item.targetDate)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h4 className="text-sm font-semibold">Marcos por vir</h4>
            {dashboard.milestones.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Nenhum marco pendente registrado.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {dashboard.milestones.map((item) => (
                  <li key={item.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                    <span>{item.title}</span>
                    <span className="text-muted-foreground">{formatGoalDate(item.dueDate)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section aria-label="Métricas calculadas">
        <h3 className="text-base font-semibold">Métricas calculadas</h3>
        {hasAreas ? (
          <div className="mt-3 rounded-xl border border-border bg-card p-4">
            <h4 className="text-sm font-semibold">Progresso por área</h4>
            <LazyChart
              option={areaProgressOption(dashboard)}
              ariaLabel="Gráfico de progresso médio conhecido por área da vida"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Áreas sem progresso conhecido não recebem barra; ausência não é zero. Algoritmo{' '}
              {dashboard.algorithms.goalProgress}.
            </p>
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState
              title="Nenhuma área com objetivo ativo"
              description="O gráfico aparece quando houver objetivos ativos com área registrada."
            />
          </div>
        )}
        <div className="mt-3 rounded-xl border border-border bg-card p-4">
          <p className="text-sm tabular-nums">
            {dashboard.studies.linkedGoals} objetivos vinculados · {dashboard.studies.totalMinutes}{' '}
            minutos de estudo · {dashboard.studies.sessionCount} sessões
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {dashboard.studies.goalsWithoutRecentActivity} sem atividade recente. Sinais lidos de
            observações reais; algoritmo {dashboard.algorithms.studyMinutes}. Nenhuma causalidade é
            atribuída automaticamente.
          </p>
          {dashboard.studies.truncated === true && (
            <p role="status" className="mt-1 text-xs font-medium text-amber-300">
              Leitura parcial das observações de estudo.
            </p>
          )}
        </div>
      </section>

      <section aria-label="Priorização determinística">
        <h3 className="text-base font-semibold">Priorização determinística</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Regra {dashboard.algorithms.attention}. Prioridades são explicáveis e não executam ações.
        </p>
        {hasAttention ? (
          <div className="mt-3 rounded-xl border border-border bg-card p-4">
            <LazyChart
              option={attentionOption(dashboard)}
              ariaLabel="Gráfico de pontuação de atenção dos objetivos com maior prioridade"
            />
            <ul className="mt-3 divide-y divide-border">
              {dashboard.attention.map((item) => (
                <li key={item.id} className="py-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="text-sm">{item.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {attentionLabel(item.level)} · {item.score}/100
                    </span>
                  </div>
                  <ul className="mt-1 space-y-1">
                    {item.reasons.map((reason) => (
                      <li key={reason.code} className="text-xs text-muted-foreground">
                        {reason.message}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState
              title="Nenhum sinal de atenção registrado"
              description="Não há recomendação quando faltam dados: nenhuma prioridade é inventada."
            />
          </div>
        )}
      </section>

      <section
        aria-label="Distribuição por situação"
        className="rounded-xl border border-border bg-card p-4"
      >
        <h3 className="text-sm font-semibold">Distribuição por situação</h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ['Rascunhos', dashboard.summary.draft],
              ['Ativos', dashboard.summary.active],
              ['Pausados', dashboard.summary.paused],
              ['Concluídos', dashboard.summary.achieved],
              ['Cancelados', dashboard.summary.cancelled],
              ['Em andamento', dashboard.summary.inProgress],
            ] as const
          ).map(([label, value]) => (
            <li key={label} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className="tabular-nums">{value}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Situações se sobrepõem: um objetivo ativo também pode estar em andamento ou com prazo
          vencido. {statusLabel('active')} é apenas o rótulo da situação ativa.
        </p>
      </section>
    </div>
  );
}
