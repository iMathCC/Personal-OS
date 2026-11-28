import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type {
  CreateMilestoneRequest,
  GoalMilestoneDto,
  LifeGoalDto,
  UpdateMilestoneRequest,
} from '@personal-os/shared';
import { EmptyState, ErrorPanel, LoadingPanel } from '@/components/states';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import type { DetailState } from './use-goals';
import {
  attentionLabel,
  formatGoalDate,
  formatPercent,
  horizonLabel,
  progressBasisLabel,
  statusLabel,
} from './format';

const FIELD_CLASS = 'mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3';

function milestoneLabel(status: GoalMilestoneDto['status']): string {
  switch (status) {
    case 'pending':
      return 'Pendente';
    case 'in_progress':
      return 'Em andamento';
    case 'completed':
      return 'Concluído';
    case 'cancelled':
      return 'Cancelado';
  }
}

interface GoalDetailProps {
  detail: DetailState;
  busy: boolean;
  onClose: () => void;
  onEdit: () => void;
  onSetStatus: (goal: LifeGoalDto, action: 'complete' | 'reopen' | 'archive') => Promise<boolean>;
  onSetProgress: (goal: LifeGoalDto, percent: number) => Promise<boolean>;
  onAddMilestone: (goal: LifeGoalDto, input: CreateMilestoneRequest) => Promise<boolean>;
  onUpdateMilestone: (
    goal: LifeGoalDto,
    milestoneId: string,
    version: number,
    input: UpdateMilestoneRequest,
  ) => Promise<boolean>;
}

function MilestoneItem({
  milestone,
  goal,
  busy,
  onUpdateMilestone,
}: {
  milestone: GoalMilestoneDto;
  goal: LifeGoalDto;
  busy: boolean;
  onUpdateMilestone: GoalDetailProps['onUpdateMilestone'];
}) {
  const open = milestone.status === 'pending' || milestone.status === 'in_progress';
  return (
    <li className="rounded-lg border border-border bg-background/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{milestone.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {milestoneLabel(milestone.status)} · {formatGoalDate(milestone.dueDate)} · v
            {milestone.version}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {milestone.status === 'pending' && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void onUpdateMilestone(goal, milestone.id, milestone.version, {
                  status: 'in_progress',
                })
              }
            >
              Iniciar
            </Button>
          )}
          {open && (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() =>
                void onUpdateMilestone(goal, milestone.id, milestone.version, {
                  status: 'completed',
                })
              }
            >
              Concluir
            </Button>
          )}
          {open && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void onUpdateMilestone(goal, milestone.id, milestone.version, {
                  status: 'cancelled',
                })
              }
            >
              Cancelar marco
            </Button>
          )}
          {!open && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void onUpdateMilestone(goal, milestone.id, milestone.version, {
                  status: 'pending',
                })
              }
            >
              Reabrir
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

export function GoalDetail({
  detail,
  busy,
  onClose,
  onEdit,
  onSetStatus,
  onSetProgress,
  onAddMilestone,
  onUpdateMilestone,
}: GoalDetailProps) {
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneDue, setMilestoneDue] = useState('');
  const [percent, setPercent] = useState('');

  if (detail.status === 'idle') {
    return (
      <EmptyState
        eyebrow="Detalhe"
        title="Selecione um objetivo"
        description="Os fatos registrados, marcos e o histórico aparecem aqui sem inventar dados."
      />
    );
  }
  if (detail.status === 'loading') return <LoadingPanel label="Carregando detalhe…" lines={3} />;
  if (detail.status === 'error') {
    return <ErrorPanel title="Detalhe indisponível" message={detail.message} />;
  }

  const { goal, milestones, history } = detail.data;
  const progress = goal.progress.percent;

  async function addMilestone(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const saved = await onAddMilestone(goal, {
      title: milestoneTitle.trim(),
      dueDate: milestoneDue === '' ? null : milestoneDue,
      status: 'pending',
    });
    if (saved) {
      setMilestoneTitle('');
      setMilestoneDue('');
    }
  }

  async function saveProgress(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const value = Number(percent);
    if (!Number.isFinite(value)) return;
    const saved = await onSetProgress(goal, value);
    if (saved) setPercent('');
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            {goal.areaName} · {horizonLabel(goal.horizon)} · prioridade {goal.priority}
          </p>
          <h3 className="mt-1 text-xl font-semibold">{goal.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {statusLabel(goal.status)} · versão {goal.version} · origem {goal.sourceId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onEdit} className="min-h-11">
            Editar
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="min-h-11">
            Fechar
          </Button>
        </div>
      </div>

      <section aria-label="Progresso" className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-sm font-semibold">Progresso calculado</h4>
          <span className="text-sm tabular-nums">{formatPercent(progress)}</span>
        </div>
        {progress === null ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Sem dados suficientes — ausência não é zero. Base:{' '}
            {progressBasisLabel(goal.progress.basis)}.
          </p>
        ) : (
          <div
            className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={`Progresso do objetivo ${goal.title}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {progressBasisLabel(goal.progress.basis)} · algoritmo{' '}
          {goal.progress.algorithmVersion ?? 'não aplicável'}
          {goal.progress.truncated ? ' · leitura parcial' : ''}
        </p>
        <form onSubmit={(event) => void saveProgress(event)} className="mt-3 flex flex-wrap gap-2">
          <label className="block flex-1 text-xs">
            <span className="text-muted-foreground">Registro manual (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={percent}
              onChange={(event) => setPercent(event.target.value)}
              className={FIELD_CLASS}
            />
          </label>
          <Button type="submit" disabled={busy} className="min-h-11">
            Atualizar
          </Button>
        </form>
      </section>

      <section
        aria-label="Fatos registrados"
        className="rounded-xl border border-border bg-card p-4"
      >
        <h4 className="text-sm font-semibold">Fatos registrados</h4>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            { label: 'Início', value: formatGoalDate(goal.startDate) },
            { label: 'Prazo', value: formatGoalDate(goal.targetDate) },
            { label: 'Marcos pendentes', value: String(goal.pendingMilestoneCount) },
            { label: 'Criado em', value: goal.createdAt },
          ].map((item) => (
            <div key={item.label}>
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="text-sm tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
        {goal.description !== null && (
          <p className="mt-3 text-sm leading-relaxed">{goal.description}</p>
        )}
        {goal.successCriteria !== null && (
          <p className="mt-2 text-xs text-muted-foreground">
            Critério de sucesso: {goal.successCriteria}
          </p>
        )}
        <p className="mt-3">
          <Link
            to={`/projetos?goalId=${encodeURIComponent(goal.id)}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm text-foreground hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver projetos vinculados
            <Icon name="arrow" size={15} />
          </Link>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Navegação opcional: o objetivo permanece a fonte da verdade; nenhum progresso é
            recalculado por este vínculo.
          </span>
        </p>
      </section>

      <section
        aria-label="Sinal de estudos"
        className="rounded-xl border border-border bg-card p-4"
      >
        <h4 className="text-sm font-semibold">Sinal de Estudos</h4>
        {goal.studyLink.linked ? (
          <>
            <p className="mt-2 text-sm tabular-nums">
              {goal.studyLink.minutes} min · {goal.studyLink.sessionCount} sessões · último registro{' '}
              {formatGoalDate(goal.studyLink.lastActivityDate)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Meta:{' '}
              {goal.studyLink.targetMinutes === null
                ? 'não informada'
                : `${goal.studyLink.targetMinutes} min`}{' '}
              · janela {goal.studyLink.window.from} a {goal.studyLink.window.to}
              {goal.studyLink.truncated ? ' · leitura parcial' : ''}
            </p>
          </>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Sem vínculo com a métrica de minutos de estudo. Nenhuma causalidade é inferida.
          </p>
        )}
      </section>

      <section
        aria-label="Priorização determinística"
        className="rounded-xl border border-border bg-card p-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-sm font-semibold">Priorização determinística</h4>
          <span className="text-xs text-muted-foreground">
            {attentionLabel(goal.attention.level)} · {goal.attention.score}/100
          </span>
        </div>
        <ul className="mt-2 space-y-1">
          {goal.attention.reasons.length === 0 ? (
            <li className="text-xs text-muted-foreground">Nenhum sinal registrado.</li>
          ) : (
            goal.attention.reasons.map((reason) => (
              <li key={reason.code} className="text-xs text-muted-foreground">
                {reason.message}
              </li>
            ))
          )}
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Regra {goal.attention.algorithmVersion}. Indicador explicável, não diagnóstico nem ordem
          automática de execução.
        </p>
      </section>

      <section aria-labelledby="milestones-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 id="milestones-title" className="text-sm font-semibold">
            Marcos ({milestones.length})
          </h4>
        </div>
        <ul className="mt-3 space-y-2">
          {milestones.length === 0 ? (
            <li className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
              Nenhum marco registrado.
            </li>
          ) : (
            milestones.map((milestone) => (
              <MilestoneItem
                key={milestone.id}
                milestone={milestone}
                goal={goal}
                busy={busy}
                onUpdateMilestone={onUpdateMilestone}
              />
            ))
          )}
        </ul>
        <form
          onSubmit={(event) => void addMilestone(event)}
          className="mt-3 grid gap-2 sm:grid-cols-3"
        >
          <label className="block text-xs sm:col-span-2">
            <span className="text-muted-foreground">Novo marco</span>
            <input
              required
              maxLength={200}
              value={milestoneTitle}
              onChange={(event) => setMilestoneTitle(event.target.value)}
              className={FIELD_CLASS}
            />
          </label>
          <label className="block text-xs">
            <span className="text-muted-foreground">Prazo</span>
            <input
              type="date"
              value={milestoneDue}
              onChange={(event) => setMilestoneDue(event.target.value)}
              className={FIELD_CLASS}
            />
          </label>
          <div className="sm:col-span-3">
            <Button type="submit" disabled={busy} className="min-h-11">
              Adicionar marco
            </Button>
          </div>
        </form>
      </section>

      <section aria-label="Ciclo de vida" className="flex flex-wrap gap-2">
        {goal.status !== 'achieved' && (
          <Button
            type="button"
            disabled={busy}
            onClick={() => void onSetStatus(goal, 'complete')}
            className="min-h-11"
          >
            Concluir
          </Button>
        )}
        {(goal.status === 'achieved' || goal.status === 'cancelled') && (
          <Button
            type="button"
            disabled={busy}
            onClick={() => void onSetStatus(goal, 'reopen')}
            className="min-h-11"
          >
            Reabrir
          </Button>
        )}
        {goal.archivedAt === null && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void onSetStatus(goal, 'archive')}
            className="min-h-11"
          >
            Arquivar
          </Button>
        )}
      </section>

      <details className="text-xs">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring">
          Histórico de auditoria ({history.length})
        </summary>
        <ul className="mt-2 space-y-2">
          {history.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-border bg-card p-3">
              <p className="font-medium">
                {entry.action} · {entry.createdAt}
              </p>
              <ul className="mt-1 space-y-1 text-muted-foreground">
                {entry.changes.map((change, index) => (
                  <li key={`${change.field}-${index}`}>
                    {change.field}: {change.from ?? '—'} → {change.to ?? '—'}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
