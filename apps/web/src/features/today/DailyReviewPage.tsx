import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, ErrorPanel, LoadingPanel } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icons';
import { formatToday } from '@/features/dashboard/format';
import {
  deriveDailyReview,
  deriveDayIndicators,
  derivePriorityItems,
  safeInternalHref,
} from './model';
import { useToday } from './use-today';

interface DailyReviewPageProps {
  readonly timezone: string;
}

const ACTION_CLASS =
  'inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm text-foreground hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring';
const REFLECTION_MAX = 500;
const REFLECTION_KEY_PREFIX = 'personal-os:daily-reflection:';

function reflectionKey(date: string): string {
  return `${REFLECTION_KEY_PREFIX}${date}`;
}

function loadReflection(date: string): string {
  try {
    return localStorage.getItem(reflectionKey(date)) ?? '';
  } catch {
    return '';
  }
}

function saveReflection(date: string, value: string): void {
  try {
    if (value.trim() === '') localStorage.removeItem(reflectionKey(date));
    else localStorage.setItem(reflectionKey(date), value);
  } catch {
    // armazenamento local indisponível: mantém apenas em memória
  }
}

function ListSection({
  title,
  description,
  items,
  empty,
}: {
  readonly title: string;
  readonly description: string;
  readonly items: readonly string[];
  readonly empty: string;
}) {
  return (
    <section aria-labelledby={`daily-${title.replace(/\s+/gu, '-')}`}>
      <h3 id={`daily-${title.replace(/\s+/gu, '-')}`} className="text-base font-semibold">
        {title}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li
              key={item}
              className="rounded-lg border border-border bg-card p-3 text-sm leading-relaxed"
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function DailyReviewPage({ timezone }: DailyReviewPageProps) {
  const today = useToday(timezone);
  const now = useMemo(() => new Date(), []);
  const [reflectionDate, setReflectionDate] = useState(today.today);
  const [reflection, setReflection] = useState(() => loadReflection(today.today));
  const [reflectionSaved, setReflectionSaved] = useState(false);
  if (reflectionDate !== today.today) {
    setReflectionDate(today.today);
    setReflection(loadReflection(today.today));
    setReflectionSaved(false);
  }

  const indicators = useMemo(
    () =>
      deriveDayIndicators({
        execution: today.execution.data,
        executionLoading: today.execution.loading,
        capacity: today.strategy.data?.capacity ?? null,
        capacityLoading: today.strategy.loading,
        alertCount: today.alerts.page.items.length,
        alertsLoading: today.alerts.loading,
      }),
    [
      today.execution.data,
      today.execution.loading,
      today.strategy.data,
      today.strategy.loading,
      today.alerts.page.items.length,
      today.alerts.loading,
    ],
  );
  const priorities = useMemo(
    () =>
      derivePriorityItems({
        execution: today.execution.data,
        tasks: today.tasks.data?.items ?? [],
        nextActions: today.nextActions.page.items,
        alerts: today.alerts.page.items,
        intelligence: today.intelligence.data,
      }),
    [
      today.execution.data,
      today.tasks.data,
      today.nextActions.page.items,
      today.alerts.page.items,
      today.intelligence.data,
    ],
  );
  const review = useMemo(
    () =>
      deriveDailyReview({
        indicators,
        execution: today.execution.data,
        intelligence: today.intelligence.data,
        capacity: today.strategy.data?.capacity ?? null,
        priorities,
        tasks: today.tasks.data?.items ?? [],
        today: today.today,
      }),
    [
      indicators,
      today.execution.data,
      today.intelligence.data,
      today.strategy.data,
      priorities,
      today.tasks.data,
      today.today,
    ],
  );

  const loading =
    today.execution.loading && today.execution.data === null && today.strategy.loading;

  return (
    <div className="space-y-8">
      <section aria-labelledby="daily-review-title">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
          Encerramento do dia
        </p>
        <h2
          id="daily-review-title"
          className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          Revisão diária
        </h2>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Icon name="clock" size={15} />
          {formatToday(timezone, now)} · semana local iniciada em {today.weekStart}
        </p>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Fatos são registros, cálculos vêm das regras da API e recomendações são sugestões. Uma
          tarefa pendente não é fracasso e quantidade de tarefas não mede produtividade.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className={ACTION_CLASS} to="/hoje">
            Voltar para hoje
          </Link>
          <Link className={ACTION_CLASS} to="/revisao">
            Abrir revisão semanal <Icon name="arrow" size={15} />
          </Link>
        </div>
      </section>

      {today.strategy.message !== null && (
        <ErrorPanel
          title="Capacidade"
          message={today.strategy.message}
          onRetry={today.strategy.reload}
        />
      )}
      {today.intelligence.message !== null && (
        <ErrorPanel
          title="Inteligência"
          message={today.intelligence.message}
          onRetry={today.intelligence.reload}
        />
      )}
      {loading && <LoadingPanel label="Reunindo fatos do dia…" lines={4} />}

      <div className="grid gap-8 lg:grid-cols-2">
        <ListSection
          title="Planejado ou relevante hoje"
          description="Tarefas com prazo hoje, em andamento ou atrasadas nos dados consultados. Não é um plano automático."
          items={review.planned}
          empty="Nenhuma tarefa planejada para hoje foi identificada."
        />
        <ListSection
          title="Executado"
          description="Tarefas concluídas encontradas na consulta atual."
          items={review.executed}
          empty="Nenhuma tarefa concluída encontrada nesta consulta."
        />
      </div>

      <ListSection
        title="Pendente / transferir"
        description="Itens ainda não concluídos. Decida conscientemente se devem continuar, ser adiados ou removidos."
        items={review.pending}
        empty="Nenhum item pendente identificado nesta consulta."
      />

      <div className="grid gap-8 lg:grid-cols-2">
        <ListSection
          title="Fatos registrados"
          description="Somente indicadores com resposta da API. Dado ausente não vira zero."
          items={review.facts}
          empty="Nenhum fato disponível nesta consulta."
        />
        <ListSection
          title="Cálculos derivados"
          description="Regras versionadas e indicadores calculados pela API; nenhum número é recalculado no navegador."
          items={review.calculations}
          empty="Nenhum cálculo disponível nesta consulta."
        />
      </div>

      <section aria-labelledby="daily-recommendations-title">
        <h3 id="daily-recommendations-title" className="text-base font-semibold">
          Recomendações
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Derivações determinísticas com origem explícita. Nenhuma é executada automaticamente.
        </p>
        {review.recommendations.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="Sem recomendações"
              description="Não havia sinal suficiente nos registros consultados."
            />
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {review.recommendations.map((item) => (
              <li key={item.id} className="rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{item.source}</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
                <Link
                  className={`${ACTION_CLASS} mt-3`}
                  to={safeInternalHref(item.href, '/inteligencia')}
                >
                  Ver origem
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="daily-reflection-title"
        className="rounded-xl border border-border bg-card p-4"
      >
        <h3 id="daily-reflection-title" className="text-base font-semibold">
          Reflexão do dia (rascunho local deste dispositivo)
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Não existe contrato de persistência de reflexão diária no backend. Este rascunho é salvo
          apenas neste navegador/dispositivo (localStorage), não é enviado à API e não é
          sincronizado entre dispositivos. Para reflexão versionada no backend, use a revisão
          semanal.
        </p>
        <label className="mt-4 block text-sm">
          <span className="text-muted-foreground">O que aprendi ou quero ajustar? (opcional)</span>
          <textarea
            rows={4}
            maxLength={REFLECTION_MAX}
            value={reflection}
            onChange={(event) => {
              setReflection(event.target.value);
              setReflectionSaved(false);
            }}
            placeholder="Escreva apenas o que você decidir registrar."
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              saveReflection(today.today, reflection);
              setReflectionSaved(true);
            }}
          >
            Salvar rascunho local
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              setReflection('');
              saveReflection(today.today, '');
              setReflectionSaved(false);
            }}
            disabled={reflection === ''}
          >
            Limpar rascunho
          </Button>
          <Link className={ACTION_CLASS} to="/revisao">
            Salvar reflexão na revisão semanal
          </Link>
          <span className="text-[11px] text-muted-foreground">
            {reflection.length}/{REFLECTION_MAX} ·{' '}
            {reflectionSaved ? 'rascunho local salvo' : 'não enviado ao backend'}
          </span>
        </div>
      </section>

      <section aria-labelledby="daily-limitations-title">
        <h3 id="daily-limitations-title" className="text-base font-semibold">
          Cobertura e limitações
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          A revisão semanal reaproveita fatos por meio das mesmas APIs; ela não recalcula nem
          duplica registros. Dias sem registro não são dias improdutivos.
        </p>
        {review.limitations.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhuma lacuna apontada pelas fontes consultadas nesta leitura.
          </p>
        ) : (
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-muted-foreground">
            {review.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
