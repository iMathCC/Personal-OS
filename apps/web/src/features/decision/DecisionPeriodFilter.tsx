import { comparisonFromValue, type DecisionComparison } from './format';

export interface DecisionPeriodSelection {
  readonly comparison: DecisionComparison | undefined;
  readonly from: string;
  readonly to: string;
}

const OPTIONS: readonly { value: DecisionComparison; label: string }[] = [
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: 'quarter', label: 'Trimestre' },
  { value: 'custom', label: 'Personalizado' },
];

const controlClass =
  'min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring';

/** Período é opcional: sem datas, a API usa a janela padrão declarada no contrato. */
export function DecisionPeriodFilter({
  value,
  onChange,
}: {
  value: DecisionPeriodSelection;
  onChange: (next: DecisionPeriodSelection) => void;
}) {
  return (
    <form
      aria-label="Período da análise"
      onSubmit={(event) => event.preventDefault()}
      className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="decision-period-comparison" className="text-sm font-medium">
          Comparação
        </label>
        <select
          id="decision-period-comparison"
          className={controlClass}
          value={value.comparison ?? ''}
          onChange={(event) =>
            onChange({ ...value, comparison: comparisonFromValue(event.target.value) })
          }
        >
          <option value="">Padrão da API</option>
          {OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="decision-period-from" className="text-sm font-medium">
          De
        </label>
        <input
          id="decision-period-from"
          type="date"
          className={controlClass}
          value={value.from}
          onChange={(event) => onChange({ ...value, from: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="decision-period-to" className="text-sm font-medium">
          Até
        </label>
        <input
          id="decision-period-to"
          type="date"
          className={controlClass}
          value={value.to}
          onChange={(event) => onChange({ ...value, to: event.target.value })}
        />
      </div>
    </form>
  );
}
