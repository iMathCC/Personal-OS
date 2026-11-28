import { useState } from 'react';
import { Link } from 'react-router';
import type { CreateLifeGoalRequest, LifeGoalDto, UpdateGoalRequest } from '@personal-os/shared';
import { EmptyState, ErrorPanel, LoadingPanel } from '@/components/states';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import type { AccountSummary } from '@/features/auth/use-session';
import { SORT_OPTIONS, useGoals } from './use-goals';
import { GoalDetail } from './GoalDetail';
import { GoalForm } from './GoalForm';
import { GoalsInsights } from './GoalsInsights';
import { attentionLabel, formatGoalDate, formatPercent, statusLabel } from './format';

interface GoalsPageProps {
  account: AccountSummary;
}

/** O formulário de criação é o único que informa área e situação inicial. */
function isCreateInput(
  input: CreateLifeGoalRequest | UpdateGoalRequest,
): input is CreateLifeGoalRequest {
  return 'areaKey' in input || 'areaId' in input || 'status' in input;
}

const FIELD_CLASS = 'mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3';

export function GoalsPage({ account }: GoalsPageProps) {
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
    setStatus,
    setProgress,
    addMilestone,
    updateMilestone,
  } = useGoals();
  const [editing, setEditing] = useState<LifeGoalDto | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  function openCreate(): void {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(goal: LifeGoalDto): void {
    setEditing(goal);
    setFormOpen(true);
  }

  async function save(input: CreateLifeGoalRequest | UpdateGoalRequest): Promise<boolean> {
    let saved: boolean;
    if (editing === null) {
      saved = isCreateInput(input) ? await create(input) : false;
    } else {
      saved = isCreateInput(input) ? false : await update(editing, input);
    }
    if (saved) {
      setFormOpen(false);
      setEditing(null);
    }
    return saved;
  }

  const selectedId = detail.status === 'ready' ? detail.data.goal.id : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
            Áreas da vida
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Objetivos e estratégia de vida
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Horizontes, prazos, marcos e progresso a partir de registros reais. A priorização é
            determinística e explicável; nenhuma recomendação é executada automaticamente. Fuso da
            conta: {account.user.timezone}.
          </p>
        </div>
        <Button
          type="button"
          onClick={openCreate}
          disabled={state.status !== 'ready'}
          className="min-h-11"
        >
          Novo objetivo
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
          aria-label={editing === null ? 'Novo objetivo' : 'Editar objetivo'}
          className="rounded-xl border border-border bg-card p-4"
        >
          <h3 className="text-base font-semibold">
            {editing === null ? 'Novo objetivo' : `Editar: ${editing.title}`}
          </h3>
          <div className="mt-3">
            <GoalForm
              key={editing?.id ?? 'novo'}
              areas={state.areas}
              goal={editing}
              busy={mutation.busy}
              onSave={save}
              onCancel={() => {
                setFormOpen(false);
                setEditing(null);
              }}
            />
          </div>
        </section>
      )}

      <section
        aria-label="Filtros de objetivos"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="block text-sm">
          <span className="text-muted-foreground">Área</span>
          <select
            value={filters.area}
            onChange={(event) => setFilter('area', event.target.value)}
            className={FIELD_CLASS}
          >
            <option value="">Todas as áreas</option>
            {(state.status === 'ready' ? state.areas : []).map((area) => (
              <option key={area.id} value={area.key}>
                {area.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Situação</span>
          <select
            value={filters.status}
            onChange={(event) => setFilter('status', event.target.value as typeof filters.status)}
            className={FIELD_CLASS}
          >
            <option value="">Todas</option>
            {(['draft', 'active', 'paused', 'achieved', 'cancelled'] as const).map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Ordenação</span>
          <select
            value={filters.sort}
            onChange={(event) => setFilter('sort', event.target.value as typeof filters.sort)}
            className={FIELD_CLASS}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Busca no título</span>
          <input
            value={filters.q}
            maxLength={200}
            onChange={(event) => setFilter('q', event.target.value)}
            placeholder="Termo do título"
            className={FIELD_CLASS}
          />
        </label>
      </section>

      {state.status === 'loading' && <LoadingPanel label="Carregando objetivos…" />}
      {state.status === 'error' && (
        <ErrorPanel
          title="Objetivos indisponíveis"
          message={state.message}
          onRetry={state.sessionExpired ? undefined : reload}
        />
      )}

      {state.status === 'ready' && (
        <>
          <GoalsInsights dashboard={state.dashboard} />

          <section aria-labelledby="goals-list-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="goals-list-title" className="text-base font-semibold">
                Objetivos registrados ({state.page.items.length})
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
                    title="Nenhum objetivo neste filtro"
                    description="Cadastre um objetivo ou ajuste os filtros. Nenhum exemplo é exibido como dado real."
                    action={
                      <Button type="button" onClick={openCreate} className="min-h-11">
                        Criar objetivo
                      </Button>
                    }
                  />
                </div>
              ) : (
                <>
                  <div>
                    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                      {state.page.items.map((goal) => (
                        <li key={goal.id} className="flex flex-wrap items-center gap-2 p-2">
                          <button
                            type="button"
                            onClick={() => select(goal.id)}
                            aria-pressed={selectedId === goal.id}
                            className={`min-w-0 flex-1 rounded-md p-2 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${
                              selectedId === goal.id ? 'bg-muted' : ''
                            }`}
                          >
                            <span className="flex flex-wrap items-start justify-between gap-2">
                              <span className="text-sm font-medium">{goal.title}</span>
                              <span className="text-xs text-muted-foreground">
                                {statusLabel(goal.status)} · p{goal.priority}
                              </span>
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {goal.areaName} · {formatGoalDate(goal.targetDate)} ·{' '}
                              {formatPercent(goal.progress.percent)}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {attentionLabel(goal.attention.level)} ({goal.attention.score}/100) ·{' '}
                              {goal.pendingMilestoneCount} marcos pendentes ·{' '}
                              {goal.studyLink.linked
                                ? `${goal.studyLink.minutes} min de estudo`
                                : 'sem vínculo com estudos'}
                            </span>
                          </button>
                          <Link
                            to={`/projetos?goalId=${encodeURIComponent(goal.id)}`}
                            aria-label={`Ver projetos vinculados a ${goal.title}`}
                            className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            Projetos
                            <Icon name="arrow" size={14} />
                          </Link>
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
                    aria-label="Detalhe do objetivo"
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <GoalDetail
                      detail={detail}
                      busy={mutation.busy}
                      onClose={() => select(null)}
                      onEdit={() => {
                        if (detail.status === 'ready') openEdit(detail.data.goal);
                      }}
                      onSetStatus={setStatus}
                      onSetProgress={setProgress}
                      onAddMilestone={addMilestone}
                      onUpdateMilestone={updateMilestone}
                    />
                  </aside>
                </>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
