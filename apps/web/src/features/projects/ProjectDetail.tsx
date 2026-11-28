import { useState, type FormEvent } from 'react';
import type {
  CreateProjectMilestoneBody,
  LifeGoalDto,
  ProjectDetailDto,
  ProjectMilestoneDto,
  ProjectSummaryDto,
  UpdateProjectMilestoneBody,
} from '@personal-os/shared';
import { EmptyState, ErrorPanel, LoadingPanel } from '@/components/states';
import { Button } from '@/components/ui/button';
import type { ProjectDetailState } from './use-projects';
import {
  formatInstant,
  formatLocalDate,
  formatPercent,
  priorityLabel,
  progressBasisLabel,
  projectStatusLabel,
} from './format';

const FIELD_CLASS = 'mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3';

function milestoneStatusLabel(status: ProjectMilestoneDto['status']): string {
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

interface ProjectDetailProps {
  detail: ProjectDetailState;
  goals: readonly LifeGoalDto[];
  busy: boolean;
  onClose: () => void;
  onEdit: () => void;
  onRemove: (project: ProjectSummaryDto) => Promise<boolean>;
  onSetGoals: (project: ProjectSummaryDto, goalIds: string[]) => Promise<boolean>;
  onAddMilestone: (
    project: ProjectSummaryDto,
    input: Omit<CreateProjectMilestoneBody, 'version'>,
  ) => Promise<boolean>;
  onUpdateMilestone: (
    project: ProjectSummaryDto,
    milestoneId: string,
    version: number,
    input: Omit<UpdateProjectMilestoneBody, 'version'>,
  ) => Promise<boolean>;
}

function MilestoneItem({
  milestone,
  project,
  busy,
  onUpdateMilestone,
}: {
  milestone: ProjectMilestoneDto;
  project: ProjectSummaryDto;
  busy: boolean;
  onUpdateMilestone: ProjectDetailProps['onUpdateMilestone'];
}) {
  const open = milestone.status === 'pending' || milestone.status === 'in_progress';
  return (
    <li className="rounded-lg border border-border bg-background/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{milestone.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {milestoneStatusLabel(milestone.status)} · prazo {formatLocalDate(milestone.dueDate)} ·
            v{milestone.version}
            {milestone.completedAt === null
              ? ' · sem conclusão registrada'
              : ` · concluído em ${formatInstant(milestone.completedAt)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {milestone.status === 'pending' && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              className="min-h-11"
              onClick={() =>
                void onUpdateMilestone(project, milestone.id, milestone.version, {
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
              className="min-h-11"
              onClick={() =>
                void onUpdateMilestone(project, milestone.id, milestone.version, {
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
              className="min-h-11"
              onClick={() =>
                void onUpdateMilestone(project, milestone.id, milestone.version, {
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
              className="min-h-11"
              onClick={() =>
                void onUpdateMilestone(project, milestone.id, milestone.version, {
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

export function ProjectDetail({
  detail,
  goals,
  busy,
  onClose,
  onEdit,
  onRemove,
  onSetGoals,
  onAddMilestone,
  onUpdateMilestone,
}: ProjectDetailProps) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [linkedGoals, setLinkedGoals] = useState<string[]>([]);
  const [goalsEdited, setGoalsEdited] = useState(false);

  if (detail.status === 'idle') {
    return (
      <EmptyState
        eyebrow="Detalhe"
        title="Selecione um projeto"
        description="Os marcos, vínculos e o progresso são carregados da API quando um projeto é selecionado."
      />
    );
  }
  if (detail.status === 'loading') return <LoadingPanel label="Carregando detalhes…" lines={3} />;
  if (detail.status === 'error') {
    return <ErrorPanel title="Detalhe indisponível" message={detail.message} />;
  }

  const project: ProjectDetailDto = detail.data;

  async function submitMilestone(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const saved = await onAddMilestone(project, {
      title: title.trim(),
      ...(dueDate === '' ? {} : { dueDate }),
      status: 'pending',
      position: project.milestones.length,
    });
    if (saved) {
      setTitle('');
      setDueDate('');
    }
  }

  async function saveGoals(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const saved = await onSetGoals(project, goalsEdited ? linkedGoals : project.goalIds);
    if (saved) setGoalsEdited(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold break-words">{project.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {projectStatusLabel(project.status)} · prioridade {priorityLabel(project.priority)} · v
            {project.version}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onClose} className="min-h-11">
            Fechar
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onEdit} className="min-h-11">
            Editar
          </Button>
        </div>
      </div>

      {project.description !== null && (
        <p className="text-sm leading-relaxed text-muted-foreground">{project.description}</p>
      )}
      <p className="text-xs text-muted-foreground">
        {formatLocalDate(project.startDate)} → {formatLocalDate(project.targetDate)}
      </p>

      <div className="rounded-lg border border-border bg-background/40 p-3">
        <p className="text-sm font-medium">Progresso: {formatPercent(project.progress.percent)}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Base: {progressBasisLabel(project.progress.basis)} · {project.progress.completedTasks}/
          {project.progress.eligibleTasks} tarefas elegíveis · algoritmo{' '}
          {project.progress.algorithmVersion}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Marco: {formatPercent(project.milestoneProgress.percent)} ·{' '}
          {progressBasisLabel(project.milestoneProgress.basis)}
        </p>
      </div>

      <section aria-label="Marcos do projeto">
        <h4 className="text-sm font-semibold">Marcos ({project.milestones.length})</h4>
        {project.milestones.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Nenhum marco registrado para este projeto.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {project.milestones.map((milestone) => (
              <MilestoneItem
                key={milestone.id}
                milestone={milestone}
                project={project}
                busy={busy}
                onUpdateMilestone={onUpdateMilestone}
              />
            ))}
          </ul>
        )}
        <form onSubmit={(event) => void submitMilestone(event)} className="mt-3 grid gap-2">
          <label className="block text-xs">
            <span className="text-muted-foreground">Novo marco</span>
            <input
              required
              maxLength={180}
              value={title}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
              className={FIELD_CLASS}
            />
          </label>
          <label className="block text-xs">
            <span className="text-muted-foreground">Prazo do marco (opcional)</span>
            <input
              type="date"
              value={dueDate}
              disabled={busy}
              onChange={(event) => setDueDate(event.target.value)}
              className={FIELD_CLASS}
            />
          </label>
          <Button
            type="submit"
            size="sm"
            disabled={busy || title.trim() === ''}
            className="min-h-11"
          >
            Adicionar marco
          </Button>
        </form>
      </section>

      <form onSubmit={(event) => void saveGoals(event)} className="grid gap-2">
        <label className="block text-xs">
          <span className="text-muted-foreground">Objetivos vinculados</span>
          <select
            multiple
            size={Math.min(Math.max(goals.length, 2), 5)}
            value={goalsEdited ? linkedGoals : project.goalIds}
            onChange={(event) => {
              setGoalsEdited(true);
              setLinkedGoals(Array.from(event.target.selectedOptions, (option) => option.value));
            }}
            className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 py-2"
          >
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" variant="outline" disabled={busy} className="min-h-11">
          Salvar vínculos
        </Button>
      </form>

      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={busy}
        onClick={() => {
          if (
            window.confirm(`Excluir o projeto "${project.title}"? Esta ação não pode ser desfeita.`)
          ) {
            void onRemove(project);
          }
        }}
        className="min-h-11"
      >
        Excluir projeto
      </Button>
    </div>
  );
}
