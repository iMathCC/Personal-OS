import { useState, type FormEvent } from 'react';
import type {
  CreateProjectBody,
  LifeGoalDto,
  PlanPriority,
  ProjectDetailDto,
  ProjectSummaryDto,
  ProjectStatus,
  UpdateProjectBody,
} from '@personal-os/shared';
import { Button } from '@/components/ui/button';
import { PRIORITY_OPTIONS, PROJECT_STATUS_OPTIONS } from './use-projects';
import { priorityLabel, projectStatusLabel } from './format';

const FIELD_CLASS = 'mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3';

interface ProjectFormProps {
  goals: readonly LifeGoalDto[];
  /** `null` cria um projeto; um projeto existente habilita a edição. */
  project: ProjectDetailDto | ProjectSummaryDto | null;
  busy: boolean;
  onSave: (input: CreateProjectBody | UpdateProjectBody) => Promise<boolean>;
  onCancel: () => void;
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function ProjectForm({ goals, project, busy, onSave, onCancel }: ProjectFormProps) {
  const [title, setTitle] = useState(project?.title ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'planned');
  const [priority, setPriority] = useState<PlanPriority>(project?.priority ?? 'medium');
  const [startDate, setStartDate] = useState(project?.startDate ?? '');
  const [targetDate, setTargetDate] = useState(project?.targetDate ?? '');
  const [goalIds, setGoalIds] = useState<string[]>(project?.goalIds ?? []);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (startDate !== '' && targetDate !== '' && targetDate < startDate) {
      setError('A data-alvo não pode ser anterior ao início.');
      return;
    }
    setError(null);
    if (project === null) {
      const input: CreateProjectBody = {
        title: title.trim(),
        description: optionalText(description),
        status,
        priority,
        ...(startDate === '' ? {} : { startDate }),
        ...(targetDate === '' ? {} : { targetDate }),
        goalIds,
        milestones: [],
      };
      const saved = await onSave(input);
      if (saved) {
        setTitle('');
        setDescription('');
        setGoalIds([]);
        setStartDate('');
        setTargetDate('');
      }
      return;
    }
    const input: UpdateProjectBody = {
      title: title.trim(),
      description: optionalText(description),
      status,
      priority,
      startDate: startDate === '' ? null : startDate,
      targetDate: targetDate === '' ? null : targetDate,
      version: project.version,
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
          onChange={(event) => setStatus(event.target.value as ProjectStatus)}
          className={FIELD_CLASS}
        >
          {PROJECT_STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {projectStatusLabel(option)}
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
        <span className="text-muted-foreground">Início</span>
        <input
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          className={FIELD_CLASS}
        />
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Data-alvo</span>
        <input
          type="date"
          min={startDate}
          value={targetDate}
          onChange={(event) => setTargetDate(event.target.value)}
          className={FIELD_CLASS}
        />
      </label>
      {project === null && (
        <label className="block text-sm sm:col-span-2">
          <span className="text-muted-foreground">Objetivos vinculados (opcional)</span>
          <select
            multiple
            size={Math.min(Math.max(goals.length, 2), 5)}
            value={goalIds}
            onChange={(event) =>
              setGoalIds(Array.from(event.target.selectedOptions, (option) => option.value))
            }
            className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 py-2"
          >
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
          {goals.length === 0 && (
            <span className="mt-1 block text-xs text-muted-foreground">
              Nenhum objetivo disponível para vínculo nesta consulta.
            </span>
          )}
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
      {error !== null && (
        <p role="alert" className="text-sm text-destructive sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" disabled={busy} className="min-h-11">
          {project === null ? 'Criar projeto' : 'Salvar alterações'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="min-h-11">
          Cancelar
        </Button>
      </div>
    </form>
  );
}
