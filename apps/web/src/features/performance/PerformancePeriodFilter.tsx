import {
  COMPARISON_LABELS,
  REVIEW_KIND_LABELS,
  comparisonFromValue,
  reviewKindFromValue,
  type PerformanceComparison,
  type PerformanceSelection,
} from './format';

const OPTIONS: readonly PerformanceComparison[] = ['week', 'month', 'quarter', 'custom'];
const controlClass =
  'min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring';

/** Janela e consolidação são opcionais: sem datas, a API aplica o padrão do contrato. */
export function PerformancePeriodFilter({
  value,
  onChange,
}: {
  value: PerformanceSelection;
  onChange: (next: PerformanceSelection) => void;
}) {
  return (
    <form
      aria-label="Período da análise longitudinal"
      onSubmit={(event) => event.preventDefault()}
      className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="performance-period-comparison" className="text-sm font-medium">
          Comparação
        </label>
        <select
          id="performance-period-comparison"
          className={controlClass}
          value={value.comparison ?? ''}
          onChange={(event) =>
            onChange({ ...value, comparison: comparisonFromValue(event.target.value) })
          }
        >
          <option value="">Padrão da API</option>
          {OPTIONS.map((option) => (
            <option key={option} value={option}>
              {COMPARISON_LABELS[option]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="performance-review-kind" className="text-sm font-medium">
          Consolidação
        </label>
        <select
          id="performance-review-kind"
          className={controlClass}
          value={value.reviewKind}
          onChange={(event) =>
            onChange({ ...value, reviewKind: reviewKindFromValue(event.target.value) })
          }
        >
          {(['monthly', 'quarterly'] as const).map((kind) => (
            <option key={kind} value={kind}>
              {REVIEW_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="performance-period-from" className="text-sm font-medium">
          De
        </label>
        <input
          id="performance-period-from"
          type="date"
          className={controlClass}
          value={value.from}
          onChange={(event) => onChange({ ...value, from: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="performance-period-to" className="text-sm font-medium">
          Até
        </label>
        <input
          id="performance-period-to"
          type="date"
          className={controlClass}
          value={value.to}
          onChange={(event) => onChange({ ...value, to: event.target.value })}
        />
      </div>
    </form>
  );
}
