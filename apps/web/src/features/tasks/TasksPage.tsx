import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { CreateTaskBody, TaskDto, UpdateTaskBody } from '@personal-os/shared';
import { EmptyState, ErrorPanel, LoadingPanel } from '@/components/states';
import { Button } from '@/components/ui/button';
import type { AccountSummary } from '@/features/auth/use-session';
import { formatLocalDate, priorityLabel, taskStatusLabel } from '@/features/projects/format';
import { PRIORITY_OPTIONS } from '@/features/projects/use-projects';
import { TaskDetail } from './TaskDetail';
import { TaskForm } from './TaskForm';
import { TASK_STATUS_OPTIONS, useTasks } from './use-tasks';

interface TasksPageProps {
  account: AccountSummary;
}

const FIELD_CLASS = 'mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3';

export function TasksPage({ account }: TasksPageProps) {
  const {
    state,
    filters,
    detail,
    mutation,
    loadingMore,
    loadMoreError,
    setFilter,
    reload,
    loadMore,
    select,
    clearMutation,
    create,
    update,
    complete,
    setDependencies,
    remove,
  } = useTasks();
  const [editing, setEditing] = useState<TaskDto | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const deepLinkedTaskId = searchParams.get('taskId');
  const appliedDeepLink = useRef<string | null>(null);

  // A "próxima ação" da Execução abre a tarefa exata, sem exigir busca manual.
  useEffect(() => {
    if (deepLinkedTaskId === null || appliedDeepLink.current === deepLinkedTaskId) return;
    appliedDeepLink.current = deepLinkedTaskId;
    select(deepLinkedTaskId);
  }, [deepLinkedTaskId, select]);

  function openCreate(): void {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(task: TaskDto): void {
    setEditing(task);
    setFormOpen(true);
  }

  async function save(input: CreateTaskBody | UpdateTaskBody): Promise<boolean> {
    let saved: boolean;
    if (editing === null) {
      saved = 'dependencyIds' in input ? await create(input) : false;
    } else {
      saved = 'version' in input ? await update(editing, input) : false;
    }
    if (saved) {
      setFormOpen(false);
      setEditing(null);
    }
    return saved;
  }

  const selectedId = detail.status === 'ready' ? detail.data.id : null;
  const projects = state.status === 'ready' ? state.projects : [];
  const goals = state.status === 'ready' ? state.goals : [];
  const candidates = state.status === 'ready' ? state.candidates : [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
            Núcleo operacional
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Tarefas</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Tarefas com prazos, dependências e conclusão registrada. A disponibilidade de execução é
            calculada pelo servidor; concluir exige confirmação explícita. Fuso da conta:{' '}
            {account.user.timezone}.
          </p>
        </div>
        <Button
          type="button"
          onClick={openCreate}
          disabled={state.status !== 'ready'}
          className="min-h-11"
        >
          Nova tarefa
        </Button>
      </div>

      {mutation.message !== null && (
        <p role="status" className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
          {mutation.message}
        </p>
      )}
      {mutation.error !== null && (
        <ErrorPanel
          title="Não foi possível salvar"
          message={mutation.error}
          onRetry={clearMutation}
        />
      )}

      {formOpen && state.status === 'ready' && (
        <section
          aria-label={editing === null ? 'Nova tarefa' : 'Editar tarefa'}
          className="rounded-xl border border-border bg-card p-4"
        >
          <h3 className="text-base font-semibold">
            {editing === null ? 'Nova tarefa' : `Editar: ${editing.title}`}
          </h3>
          <div className="mt-3">
            <TaskForm
              key={editing?.id ?? 'nova'}
              projects={projects}
              goals={goals}
              candidates={candidates}
              task={editing}
              busy={mutation.busy}
              onSave={(input) => save(input)}
              onCancel={() => {
                setFormOpen(false);
                setEditing(null);
              }}
            />
          </div>
        </section>
      )}

      <section aria-label="Filtros de tarefas" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          <span className="text-muted-foreground">Situação</span>
          <select
            value={filters.status}
            onChange={(event) => setFilter('status', event.target.value as typeof filters.status)}
            className={FIELD_CLASS}
          >
            <option value="">Todas</option>
            {TASK_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {taskStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Prioridade</span>
          <select
            value={filters.priority}
            onChange={(event) =>
              setFilter('priority', event.target.value as typeof filters.priority)
            }
            className={FIELD_CLASS}
          >
            <option value="">Todas</option>
            {PRIORITY_OPTIONS.map((priority) => (
              <option key={priority} value={priority}>
                {priorityLabel(priority)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Projeto</span>
          <select
            value={filters.projectId}
            onChange={(event) => setFilter('projectId', event.target.value)}
            className={FIELD_CLASS}
          >
            <option value="">Todos os projetos</option>
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
            value={filters.goalId}
            onChange={(event) => setFilter('goalId', event.target.value)}
            className={FIELD_CLASS}
          >
            <option value="">Todos os objetivos</option>
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Busca no título</span>
          <input
            value={filters.search}
            maxLength={120}
            onChange={(event) => setFilter('search', event.target.value)}
            placeholder="Termo do título"
            className={FIELD_CLASS}
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Prazo a partir de</span>
          <input
            type="date"
            value={filters.dueAfter}
            onChange={(event) => setFilter('dueAfter', event.target.value)}
            className={FIELD_CLASS}
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Prazo até</span>
          <input
            type="date"
            min={filters.dueAfter}
            value={filters.dueBefore}
            onChange={(event) => setFilter('dueBefore', event.target.value)}
            className={FIELD_CLASS}
          />
        </label>
      </section>

      {state.status === 'loading' && <LoadingPanel label="Carregando tarefas…" />}
      {state.status === 'error' && (
        <ErrorPanel
          title="Tarefas indisponíveis"
          message={state.message}
          onRetry={state.sessionExpired ? undefined : reload}
        />
      )}

      {state.status === 'ready' && (
        <section aria-labelledby="tasks-list-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="tasks-list-title" className="text-base font-semibold">
              Tarefas registradas ({state.page.items.length})
            </h3>
            <Button type="button" variant="ghost" size="sm" onClick={reload} className="min-h-11">
              Atualizar
            </Button>
          </div>
          {state.page.truncated === true && (
            <p role="status" className="mt-1 text-xs font-medium text-amber-300">
              Lista parcial: o servidor atingiu o limite de leitura.
            </p>
          )}
          <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
            {state.page.items.length === 0 ? (
              <div className="xl:col-span-2">
                <EmptyState
                  eyebrow="Sem dados"
                  title="Nenhuma tarefa neste filtro"
                  description="Cadastre uma tarefa ou ajuste os filtros. Nenhum exemplo é exibido como dado real."
                  action={
                    <Button type="button" onClick={openCreate} className="min-h-11">
                      Criar tarefa
                    </Button>
                  }
                />
              </div>
            ) : (
              <>
                <div>
                  <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                    {state.page.items.map((task) => (
                      <li key={task.id} className="flex flex-wrap items-center gap-2 p-4">
                        <button
                          type="button"
                          onClick={() => select(task.id)}
                          aria-pressed={selectedId === task.id}
                          className={`min-w-0 flex-1 rounded-md text-left transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring ${
                            selectedId === task.id ? 'text-primary' : ''
                          }`}
                        >
                          <span className="block text-sm font-medium">{task.title}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {taskStatusLabel(task.status)} · {priorityLabel(task.priority)} ·{' '}
                            {formatLocalDate(task.dueDate)} · {task.projectTitle ?? 'Sem projeto'}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {task.dependencyState === 'blocked'
                              ? 'Bloqueada por dependências'
                              : task.executable
                                ? 'Disponível para execução'
                                : 'Sem execução disponível'}
                            {task.overdue ? ' · atrasada' : ''}
                          </span>
                        </button>
                        {task.status !== 'completed' && task.status !== 'cancelled' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={
                              mutation.busy ||
                              task.dependencyState === 'blocked' ||
                              task.status === 'blocked'
                            }
                            onClick={() => void complete(task)}
                            className="min-h-11"
                          >
                            Concluir
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {state.page.nextCursor !== undefined && (
                    <div className="mt-3">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={loadingMore}
                        onClick={loadMore}
                        className="min-h-11"
                      >
                        {loadingMore ? 'Carregando…' : 'Carregar mais'}
                      </Button>
                    </div>
                  )}
                  {loadMoreError !== null && (
                    <p role="alert" className="mt-2 text-sm text-destructive">
                      {loadMoreError}
                    </p>
                  )}
                </div>
                <aside
                  aria-label="Detalhe da tarefa"
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <TaskDetail
                    detail={detail}
                    candidates={candidates}
                    busy={mutation.busy}
                    onClose={() => select(null)}
                    onEdit={() => {
                      if (detail.status === 'ready') openEdit(detail.data);
                    }}
                    onComplete={(task) => complete(task)}
                    onSetDependencies={(task, dependencyIds) =>
                      setDependencies(task, dependencyIds)
                    }
                    onRemove={(task) => remove(task)}
                  />
                </aside>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
