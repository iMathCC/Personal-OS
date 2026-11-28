import { formatPeriod, INSUFFICIENT_DATA } from './format';

interface Evidence {
  readonly source: string;
  readonly period: { readonly from: string; readonly to: string };
  readonly method: string;
  readonly limitations: readonly string[];
}

/** Evidência sempre explícita: origem, janela, método, confiança e limitações. */
export function PerformanceEvidence({
  evidence,
  confidence = null,
  extraLimitations = [],
}: {
  evidence: Evidence;
  confidence?: number | null;
  extraLimitations?: readonly string[];
}) {
  const limitations = [...new Set([...evidence.limitations, ...extraLimitations])];
  return (
    <div className="mt-3 space-y-1 border-t border-border pt-3 text-[11px] text-muted-foreground">
      <p className="break-words">
        <span className="font-semibold text-foreground/80">Fonte:</span> {evidence.source} ·{' '}
        {formatPeriod(evidence.period)}
      </p>
      <p className="break-words">
        <span className="font-semibold text-foreground/80">Método:</span> {evidence.method}
      </p>
      <p>
        <span className="font-semibold text-foreground/80">Confiança:</span>{' '}
        {confidence === null ? INSUFFICIENT_DATA : `${Math.round(confidence * 100)}%`}
      </p>
      {limitations.length > 0 && (
        <ul className="list-inside list-disc space-y-0.5 break-words">
          {limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StatusBadge({ label, warning = false }: { label: string; warning?: boolean }) {
  return (
    <span
      className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${
        warning ? 'bg-amber-500/15 text-amber-300' : 'bg-muted text-foreground/80'
      }`}
    >
      {label}
    </span>
  );
}

export function LimitationList({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="list-inside list-disc space-y-1 text-xs leading-relaxed text-muted-foreground">
      {items.map((item) => (
        <li key={item} className="break-words">
          {item}
        </li>
      ))}
    </ul>
  );
}
