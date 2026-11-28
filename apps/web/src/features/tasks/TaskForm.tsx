import { useState, type FormEvent } from 'react';
import type {
  CreateTaskBody,
  LifeGoalDto,
  PlanPriority,
  ProjectSummaryDto,
  TaskDto,
  TaskStatus,
  UpdateTaskBody,
} from '@personal-os/shared';
import { Button } from '@/components/ui/button';
import { priorityLabel, taskStatusLabel } from '@/features/projects/format';
import { PRIORITY_OPTIONS } from '@/features/projects/use-projects';
import { TASK_STATUS_OPTIONS } from './use-tasks';

const FIELD_CLASS = 'mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3';

interface TaskFormProps {
  projects: readonly ProjectSummaryDto[];
  goals: readonly LifeGoalDto[];
  candidates: readonly TaskDto[];
  /** `null` cria uma tarefa; uma tarefa existente habilita a edição. */
  task: TaskDto | null;
  busy: boolean;
  onSave: (input: CreateTaskBody | UpdateTaskBody) => Promise<boolean>;
  onCancel: () => void;
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function TaskForm({
  projects,
  goals,
  candidates,
  task,
  busy,
  onSave,
  onCancel,
}: TaskFormProps) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [projectId, setProjectId] = useState(task?.projectId ?? '');
  const [goalId, setGoalId] = useState(task?.goalId ?? '');
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'todo');
  const [priority, setPriority] = useState<PlanPriority>(task?.priority ?? 'medium');
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
  const [estimate, setEstimate] = useState(task?.estimateMinutes?.toString() ?? '');
  const [dependencyIds, setDependencyIds] = useState<string[]>([]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (task === null) {
      const input: CreateTaskBody = {
        title: title.trim(),
        description: optionalText(description),
        ...(projectId === '' ? {} : { projectId }),
        ...(goalId === '' ? {} : { goalId }),
        status,
        priority,
        ...(dueDate === '' ? {} : { dueDate }),
        ...(estimate === '' ? {} : { estimateMinutes: Number(estimate) }),
        dependencyIds,
      };
      const saved = await onSave(input);
      if (saved) {
        setTitle('');
        setDescription('');
        setDependencyIds([]);
        setDueDate('');
        setEstimate('');
      }
      return;
    }
    const input: UpdateTaskBody = {
      title: title.trim(),
      description: optionalText(description),
      projectId: projectId === '' ? null : projectId,
      goalId: goalId === '' ? null : goalId,
      status,
      priority,
      dueDate: dueDate === '' ? null : dueDate,
      estimateMinutes: estimate === '' ? null : Number(estimate),
      version: task.version,
    };
    await onSave(input);
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm sm:col-span-2">
        <span className="text-muted-foreground">Título</span>
        <input
          required
          maxLength={180}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={FIELD_CLASS}
        />
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Situação</span>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as TaskStatus)}
          className={FIELD_CLASS}
        >
          {TASK_STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {taskStatusLabel(option)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Prioridade</span>
        <select
          value={priority}
          onChange={(event) => setPriority(event.target.value as PlanPriority)}
          className={FIELD_CLASS}
        >
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {priorityLabel(option)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Projeto</span>
        <select
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          className={FIELD_CLASS}
        >
          <option value="">Sem projeto</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Objetivo</span>
        <select
          value={goalId}
          onChange={(event) => setGoalId(event.target.value)}
          className={FIELD_CLASS}
        >
          <option value="">Sem objetivo</option>
          {goals.map((goal) => (
            <option key={goal.id} value={goal.id}>
              {goal.title}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Prazo</span>
        <input
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          className={FIELD_CLASS}
        />
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Estimativa (minutos)</span>
        <input
          type="number"
          min={0}
          max={100000}
          value={estimate}
          onChange={(event) => setEstimate(event.target.value)}
          className={FIELD_CLASS}
        />
      </label>
      {task === null && candidates.length > 0 && (
        <label className="block text-sm sm:col-span-2">
          <span className="text-muted-foreground">Dependências iniciais (opcional)</span>
          <select
            multiple
            size={Math.min(candidates.length, 4)}
            value={dependencyIds}
            onChange={(event) =>
              setDependencyIds(Array.from(event.target.selectedOptions, (option) => option.value))
            }
            className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 py-2"
          >
            {candidates
              .filter(
                (candidate) => candidate.status !== 'completed' && candidate.status !== 'cancelled',
              )
              .map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.title}
                </option>
              ))}
          </select>
        </label>
      )}
      <label className="block text-sm sm:col-span-2">
        <span className="text-muted-foreground">Descrição</span>
        <textarea
          rows={3}
          maxLength={2000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" disabled={busy} className="min-h-11">
          {task === null ? 'Criar tarefa' : 'Salvar alterações'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="min-h-11">
          Cancelar
        </Button>
      </div>
    </form>
  );
}
