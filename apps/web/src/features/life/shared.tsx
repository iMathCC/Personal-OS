import { useState, type ReactNode } from 'react';
import type { LifeDomainDto } from '@personal-os/shared';
import { EmptyState, ErrorPanel, LoadingPanel } from '@/components/states';
import { Button } from '@/components/ui/button';
import { lifeApi, type LifePeriod, type Page } from '@/lib/api';
import { FIELD_CLASS, TEXTAREA_CLASS } from '@/features/planning/fields';
import {
  failureMessage,
  hasNextCursor,
  newIdempotencyKey,
  useLifeResource,
  type AsyncState,
} from './shared-helpers';

export function PeriodControls({
  period,
  onChange,
}: {
  readonly period: LifePeriod;
  readonly onChange: (period: LifePeriod) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
      <label className="text-xs text-muted-foreground">
        De
        <input
          type="date"
          aria-label="Data inicial do período"
          className={FIELD_CLASS}
          value={period.from}
          onChange={(event) => onChange({ ...period, from: event.target.value })}
        />
      </label>
      <label className="text-xs text-muted-foreground">
        Até
        <input
          type="date"
          aria-label="Data final do período"
          className={FIELD_CLASS}
          value={period.to}
          onChange={(event) => onChange({ ...period, to: event.target.value })}
        />
      </label>
      <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
        Período em data local (AAAA-MM-DD). Ausência de registro não significa ausência de
        atividade.
      </p>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

export function SummaryView<T>({
  state,
  children,
}: {
  readonly state: AsyncState<T>;
  readonly children: (data: T) => ReactNode;
}) {
  if (state.status === 'loading') return <LoadingPanel label="Calculando indicadores…" />;
  if (state.status === 'error') {
    return (
      <ErrorPanel
        title="Não foi possível calcular o resumo"
        message={state.error ?? 'Resumo indisponível.'}
        onRetry={state.reload}
      />
    );
  }
  if (state.data === null) {
    return (
      <EmptyState
        eyebrow="Sem dados"
        title="Nenhum resumo disponível"
        description="A consulta respondeu sem resumo para o período. Isso não é uma falha e não significa ausência de atividade."
      />
    );
  }
  return <>{children(state.data)}</>;
}

export function Metric({
  label,
  value,
  hint,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-4">
      <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Limitations({ items }: { readonly items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4 rounded-lg border border-dashed border-border p-4">
      <p className="text-xs font-semibold">Limites e premissas</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------- Formulário */

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'boolean' | 'textarea';

export interface FieldDef {
  readonly key: string;
  readonly label: string;
  readonly type?: FieldType;
  readonly required?: boolean;
  /** Campo vazio vira `null` em vez de ser omitido. */
  readonly nullable?: boolean;
  readonly options?: readonly { value: string; label: string }[];
  readonly placeholder?: string;
  readonly help?: string;
}

type FormValues = Record<string, string>;

function initialValues(fields: readonly FieldDef[]): FormValues {
  return Object.fromEntries(fields.map((field) => [field.key, '']));
}

function valuesFromRecord(
  fields: readonly FieldDef[],
  record: Record<string, unknown>,
): FormValues {
  return Object.fromEntries(
    fields.map((field) => {
      const value = record[field.key];
      if (value === null || value === undefined) return [field.key, ''];
      if (field.type === 'boolean') return [field.key, value === true ? 'true' : 'false'];
      return [field.key, String(value)];
    }),
  );
}

function payloadFromValues(
  fields: readonly FieldDef[],
  values: FormValues,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.key] ?? '';
    if (raw.trim() === '') {
      if (field.nullable === true) payload[field.key] = null;
      continue;
    }
    if (field.type === 'number') payload[field.key] = Number(raw);
    else if (field.type === 'boolean') payload[field.key] = raw === 'true';
    else payload[field.key] = raw.trim();
  }
  return payload;
}

function renderField(
  field: FieldDef,
  value: string,
  onChange: (value: string) => void,
  disabled: boolean,
) {
  const common = {
    id: `life-${field.key}`,
    value,
    disabled,
    required: field.required === true,
    className: FIELD_CLASS,
    onChange: (event: { target: { value: string } }) => onChange(event.target.value),
  };
  if (field.type === 'textarea') {
    return (
      <textarea
        {...common}
        className={TEXTAREA_CLASS}
        placeholder={field.placeholder}
        aria-label={field.label}
      />
    );
  }
  if (field.type === 'select') {
    return (
      <select {...common} aria-label={field.label}>
        <option value="">—</option>
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === 'boolean') {
    return (
      <select {...common} aria-label={field.label}>
        <option value="">—</option>
        <option value="true">Sim</option>
        <option value="false">Não</option>
      </select>
    );
  }
  return (
    <input
      {...common}
      type={field.type ?? 'text'}
      placeholder={field.placeholder}
      aria-label={field.label}
    />
  );
}

export interface ColumnDef {
  readonly key: string;
  readonly label: string;
  readonly format?: (value: unknown, record: Record<string, unknown>) => string;
}

function cellText(column: ColumnDef, record: Record<string, unknown>): string {
  const value = record[column.key];
  if (column.format !== undefined) return column.format(value, record);
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'sim' : 'não';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

interface RecordPanelProps {
  readonly domain: LifeDomainDto;
  readonly title: string;
  readonly description: string;
  readonly fields: readonly FieldDef[];
  readonly columns: readonly ColumnDef[];
  readonly period: LifePeriod;
}

/** Lista, criação, correção versionada e histórico de um domínio modelado. */
export function LifeRecordPanel({
  domain,
  title,
  description,
  fields,
  columns,
  period,
}: RecordPanelProps) {
  const [tab, setTab] = useState<'records' | 'history'>('records');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursors, setCursors] = useState<string[]>([]);
  const [values, setValues] = useState<FormValues>(() => initialValues(fields));
  const [editing, setEditing] = useState<{ id: string; version: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recordsTabId = `life-${domain}-tab-records`;
  const historyTabId = `life-${domain}-tab-history`;
  const panelId = `life-${domain}-panel`;

  const records = useLifeResource<Page<Record<string, unknown>>>(
    (signal) =>
      lifeApi.list(domain, period, cursor, signal) as Promise<Page<Record<string, unknown>>>,
    [domain, period.from, period.to, cursor],
  );
  const history = useLifeResource<Page<Record<string, unknown>>>(
    (signal) => lifeApi.history(domain, cursor, signal) as Promise<Page<Record<string, unknown>>>,
    [domain, cursor, tab],
  );
  const state = tab === 'records' ? records : history;

  function change(field: string, value: string): void {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function resetForm(): void {
    setValues(initialValues(fields));
    setEditing(null);
  }

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const payload = payloadFromValues(fields, values);
      if (editing === null) {
        await lifeApi.create(domain, payload, newIdempotencyKey());
        setMessage('Registro criado com proveniência e auditoria.');
      } else {
        await lifeApi.correct(domain, editing.id, payload, newIdempotencyKey(), editing.version);
        setMessage('Correção registrada como nova versão; a anterior foi preservada.');
      }
      resetForm();
      setCursor(undefined);
      setCursors([]);
      records.reload();
      history.reload();
    } catch (cause: unknown) {
      setError(failureMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex gap-2" role="tablist" aria-label={`Visualização de ${title}`}>
          <Button
            type="button"
            role="tab"
            id={recordsTabId}
            aria-controls={panelId}
            aria-selected={tab === 'records'}
            size="sm"
            variant={tab === 'records' ? 'default' : 'outline'}
            onClick={() => {
              setTab('records');
              setCursor(undefined);
              setCursors([]);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') {
                setTab('history');
                setCursor(undefined);
                setCursors([]);
              }
            }}
          >
            Registros
          </Button>
          <Button
            type="button"
            role="tab"
            id={historyTabId}
            aria-controls={panelId}
            aria-selected={tab === 'history'}
            size="sm"
            variant={tab === 'history' ? 'default' : 'outline'}
            onClick={() => {
              setTab('history');
              setCursor(undefined);
              setCursors([]);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') {
                setTab('records');
                setCursor(undefined);
                setCursors([]);
              }
            }}
          >
            Histórico
          </Button>
        </div>
      </div>

      <form
        className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {fields.map((field) => (
          <label key={field.key} className="text-xs text-muted-foreground">
            {field.label}
            {renderField(field, values[field.key] ?? '', (value) => change(field.key, value), busy)}
            {field.help && <span className="mt-1 block text-[11px]">{field.help}</span>}
          </label>
        ))}
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
          <Button type="submit" disabled={busy} className="min-h-11">
            {editing === null ? 'Registrar' : `Salvar correção da v${editing.version}`}
          </Button>
          {editing !== null && (
            <Button type="button" variant="outline" onClick={resetForm} className="min-h-11">
              Cancelar correção
            </Button>
          )}
        </div>
      </form>

      {message && (
        <p className="mt-3 text-sm text-primary" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div
        className="mt-5"
        role="tabpanel"
        id={panelId}
        aria-labelledby={tab === 'records' ? recordsTabId : historyTabId}
      >
        {state.status === 'loading' && (
          <LoadingPanel label="Carregando registros reais…" lines={4} />
        )}
        {state.status === 'error' || state.data === null ? (
          <ErrorPanel
            title="Falha ao carregar registros"
            message={state.error ?? 'Registros indisponíveis.'}
            onRetry={state.reload}
          />
        ) : state.data.items.length === 0 ? (
          <EmptyState
            eyebrow={tab === 'history' ? 'histórico' : 'sem registros'}
            title={tab === 'history' ? 'Nenhuma versão registrada' : 'Nenhum registro no período'}
            description={
              tab === 'history'
                ? 'Correções preservam a versão anterior e aparecem aqui.'
                : 'A ausência de registro não significa ausência de atividade. Ajuste o período ou registre manualmente.'
            }
          />
        ) : (
          <div
            tabIndex={0}
            role="region"
            aria-label="Tabela de registros; use o teclado para rolar horizontalmente"
            className="overflow-x-auto focus-visible:ring-2 focus-visible:ring-ring"
          >
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  {columns.map((column) => (
                    <th key={column.key} scope="col" className="px-2 py-2 font-medium">
                      {column.label}
                    </th>
                  ))}
                  <th scope="col" className="px-2 py-2 font-medium">
                    Origem
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Versão
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Ação
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.data.items.map((record) => (
                  <tr key={String(record.id)} className="border-b border-border/60 align-top">
                    {columns.map((column) => (
                      <td key={column.key} className="px-2 py-2 text-xs break-words">
                        {cellText(column, record)}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-xs">{String(record.originKind ?? '—')}</td>
                    <td className="px-2 py-2 text-xs tabular-nums">
                      {String(record.version ?? '—')}
                    </td>
                    <td className="px-2 py-2 text-xs">
                      {tab === 'records' && record.status === 'active' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing({
                              id: String(record.id),
                              version: Number(record.version),
                            });
                            setValues(valuesFromRecord(fields, record));
                            setMessage(null);
                            setError(null);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        >
                          Corrigir
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex items-center gap-2">
              {cursors.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = [...cursors];
                    next.pop();
                    setCursors(next);
                    setCursor(next[next.length - 1]);
                  }}
                >
                  Anterior
                </Button>
              )}
              {hasNextCursor(state.data) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = state.data?.nextCursor;
                    if (next === null || next === undefined) return;
                    setCursors([...cursors, cursor ?? '']);
                    setCursor(next);
                  }}
                >
                  Próxima
                </Button>
              )}
              {state.data.truncated && (
                <span className="text-xs text-muted-foreground">
                  Resultado limitado a 200 registros.
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
