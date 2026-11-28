import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type {
  CreateProjectBody,
  ProjectDetailDto,
  ProjectSummaryDto,
  UpdateProjectBody,
} from '@personal-os/shared';
import { EmptyState, ErrorPanel, LoadingPanel } from '@/components/states';
import { Button } from '@/components/ui/button';
import type { AccountSummary } from '@/features/auth/use-session';
import { ProjectDetail } from './ProjectDetail';
import { ProjectForm } from './ProjectForm';
import {
  formatLocalDate,
  formatPercent,
  goalIdFromUrl,
  priorityLabel,
  projectStatusLabel,
} from './format';
import { PRIORITY_OPTIONS, PROJECT_STATUS_OPTIONS, useProjects } from './use-projects';

interface ProjectsPageProps {
  account: AccountSummary;
}

const FIELD_CLASS = 'mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3';

export function ProjectsPage({ account }: ProjectsPageProps) {
  const [searchParams] = useSearchParams();
  const urlGoalId = goalIdFromUrl(searchParams.get('goalId'));
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
    remove,
    setGoals,
    addMilestone,
    updateMilestone,
  } = useProjects({ goalId: urlGoalId });
  const [editing, setEditing] = useState<ProjectDetailDto | null>(null);

  // O parâmetro da URL é a origem do filtro inicial; mudanças manuais no select não o reescrevem.
  useEffect(() => {
    setFilter('goalId', urlGoalId);
  }, [urlGoalId, setFilter]);

  const [formOpen, setFormOpen] = useState(false);

  function openCreate(): void {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(project: ProjectDetailDto): void {
    setEditing(project);
    setFormOpen(true);
  }

  async function save(input: CreateProjectBody | UpdateProjectBody): Promise<boolean> {
    let saved: boolean;
    if (editing === null) {
      saved = 'milestones' in input ? await create(input) : false;
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
  const goals = state.status === 'ready' ? state.goals : [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
            Núcleo operacional
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Projetos</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Projetos, marcos e vínculos com objetivos a partir de registros reais. O progresso é
            calculado pelo servidor; nenhuma ação é executada automaticamente. Fuso da conta:{' '}
            {account.user.timezone}.
          </p>
        </div>
        <Button
          type="button"
          onClick={openCreate}
          disabled={state.status !== 'ready'}
          className="min-h-11"
        >
          Novo projeto
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
          aria-label={editing === null ? 'Novo projeto' : 'Editar projeto'}
          className="rounded-xl border border-border bg-card p-4"
        >
          <h3 className="text-base font-semibold">
            {editing === null ? 'Novo projeto' : `Editar: ${editing.title}`}
          </h3>
          <div className="mt-3">
            <ProjectForm
              key={editing?.id ?? 'novo'}
              goals={goals}
              project={editing}
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

      <section
        aria-label="Filtros de projetos"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="block text-sm">
          <span className="text-muted-foreground">Situação</span>
          <select
            value={filters.status}
            onChange={(event) => setFilter('status', event.target.value as typeof filters.status)}
            className={FIELD_CLASS}
          >
            <option value="">Todas</option>
            {PROJECT_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {projectStatusLabel(status)}
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
      </section>

      {state.status === 'loading' && <LoadingPanel label="Carregando projetos…" />}
      {state.status === 'error' && (
        <ErrorPanel
          title="Projetos indisponíveis"
          message={state.message}
          onRetry={state.sessionExpired ? undefined : reload}
        />
      )}

      {state.status === 'ready' && (
        <section aria-labelledby="projects-list-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="projects-list-title" className="text-base font-semibold">
              Projetos registrados ({state.page.items.length})
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
                  title="Nenhum projeto neste filtro"
                  description="Cadastre um projeto ou ajuste os filtros. Nenhum exemplo é exibido como dado real."
                  action={
                    <Button type="button" onClick={openCreate} className="min-h-11">
                      Criar projeto
                    </Button>
                  }
                />
              </div>
            ) : (
              <>
                <div>
                  <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                    {state.page.items.map((project: ProjectSummaryDto) => (
                      <li key={project.id}>
                        <button
                          type="button"
                          onClick={() => select(project.id)}
                          aria-pressed={selectedId === project.id}
                          className={`w-full p-4 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${
                            selectedId === project.id ? 'bg-muted' : ''
                          }`}
                        >
                          <span className="flex flex-wrap items-start justify-between gap-2">
                            <span className="text-sm font-medium">{project.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {projectStatusLabel(project.status)} ·{' '}
                              {priorityLabel(project.priority)}
                            </span>
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {formatLocalDate(project.startDate)} →{' '}
                            {formatLocalDate(project.targetDate)} ·{' '}
                            {formatPercent(project.progress.percent)}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {project.progress.completedTasks}/{project.progress.totalTasks} tarefas
                            ·{project.goalIds.length} vínculo(s) · v{project.version}
                          </span>
                        </button>
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
                  aria-label="Detalhe do projeto"
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <ProjectDetail
                    detail={detail}
                    goals={goals}
                    busy={mutation.busy}
                    onClose={() => select(null)}
                    onEdit={() => {
                      if (detail.status === 'ready') openEdit(detail.data);
                    }}
                    onRemove={(project) => remove(project)}
                    onSetGoals={(project, goalIds) => setGoals(project, goalIds)}
                    onAddMilestone={(project, input) => addMilestone(project, input)}
                    onUpdateMilestone={(project, milestoneId, version, input) =>
                      updateMilestone(project, milestoneId, version, input)
                    }
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
