import { useState, type FormEvent } from 'react';
import type { SetTaskDependenciesBody, TaskDetailDto, TaskDto } from '@personal-os/shared';
import { EmptyState, ErrorPanel, LoadingPanel } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  formatInstant,
  formatLocalDate,
  priorityLabel,
  taskStatusLabel,
} from '@/features/projects/format';
import type { TaskDetailState } from './use-tasks';

interface TaskDetailProps {
  detail: TaskDetailState;
  candidates: readonly TaskDto[];
  busy: boolean;
  onClose: () => void;
  onEdit: () => void;
  onComplete: (task: TaskDto) => Promise<boolean>;
  onSetDependencies: (
    task: TaskDetailDto,
    dependencyIds: SetTaskDependenciesBody['dependencyIds'],
  ) => Promise<boolean>;
  onRemove: (task: TaskDto) => Promise<boolean>;
}

export function TaskDetail({
  detail,
  candidates,
  busy,
  onClose,
  onEdit,
  onComplete,
  onSetDependencies,
  onRemove,
}: TaskDetailProps) {
  const [dependencyIds, setDependencyIds] = useState<string[] | null>(null);

  if (detail.status === 'idle') {
    return (
      <EmptyState
        eyebrow="Detalhe"
        title="Selecione uma tarefa"
        description="Dependências, bloqueios e justificativas vêm da API quando uma tarefa é selecionada."
      />
    );
  }
  if (detail.status === 'loading') return <LoadingPanel label="Carregando detalhes…" lines={3} />;
  if (detail.status === 'error') {
    return <ErrorPanel title="Detalhe indisponível" message={detail.message} />;
  }

  const task = detail.data;
  const selected =
    dependencyIds === null
      ? task.dependencies.map((dependency) => dependency.dependsOnTaskId)
      : dependencyIds;

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const saved = await onSetDependencies(task, selected);
    if (saved) setDependencyIds(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold break-words">{task.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {taskStatusLabel(task.status)} · prioridade {priorityLabel(task.priority)} · v
            {task.version}
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

      {task.description !== null && (
        <p className="text-sm leading-relaxed text-muted-foreground">{task.description}</p>
      )}
      <p className="text-xs text-muted-foreground">
        {task.projectTitle ?? 'Sem projeto'} · {formatLocalDate(task.dueDate)} ·{' '}
        {task.estimateMinutes === null ? 'Sem estimativa' : `${task.estimateMinutes} min`}
      </p>

      <div className="rounded-lg border border-border bg-background/40 p-3">
        <p className="text-sm font-medium">
          Execução: {task.executable ? 'disponível' : 'indisponível'} ·{' '}
          {task.dependencyState === 'blocked' ? 'bloqueada' : task.dependencyState}
          {task.overdue ? ' · atrasada' : ''}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{task.reason}</p>
        {task.blockerIds.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Bloqueios: {task.blockerIds.join(', ')}
          </p>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">
          Conclusão registrada: {formatInstant(task.completedAt)}. Nenhuma ação é executada sem
          confirmação.
        </p>
      </div>

      {task.status !== 'completed' && task.status !== 'cancelled' && (
        <Button
          type="button"
          size="sm"
          disabled={busy || task.dependencyState === 'blocked' || task.status === 'blocked'}
          onClick={() => void onComplete(task)}
          className="min-h-11"
        >
          Concluir tarefa
        </Button>
      )}

      <section aria-label="Dependências da tarefa">
        <h4 className="text-sm font-semibold">Dependências ({task.dependencies.length})</h4>
        {task.dependencies.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">Nenhuma dependência registrada.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
            {task.dependencies.map((dependency) => (
              <li key={dependency.id} className="p-3 text-xs text-muted-foreground">
                {dependency.dependsOnTitle} · {taskStatusLabel(dependency.dependsOnStatus)}
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={(event) => void save(event)} className="mt-3 grid gap-2">
          <label className="block text-xs">
            <span className="text-muted-foreground">Editar dependências</span>
            <select
              multiple
              size={Math.min(Math.max(candidates.length, 2), 5)}
              value={selected}
              disabled={busy}
              onChange={(event) =>
                setDependencyIds(Array.from(event.target.selectedOptions, (option) => option.value))
              }
              className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 py-2"
            >
              {candidates
                .filter((candidate) => candidate.id !== task.id)
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.title} · {taskStatusLabel(candidate.status)}
                  </option>
                ))}
            </select>
          </label>
          <Button type="submit" size="sm" variant="outline" disabled={busy} className="min-h-11">
            Salvar dependências
          </Button>
        </form>
        {candidates.length === 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Nenhuma outra tarefa disponível para dependência nesta consulta.
          </p>
        )}
      </section>

      {task.dependents.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Tarefas que dependem desta: {task.dependents.map((item) => item.title).join(', ')}
        </p>
      )}

      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={busy}
        onClick={() => {
          if (
            window.confirm(`Excluir a tarefa "${task.title}"? Esta ação não pode ser desfeita.`)
          ) {
            void onRemove(task);
          }
        }}
        className="min-h-11"
      >
        Excluir tarefa
      </Button>
    </div>
  );
}
