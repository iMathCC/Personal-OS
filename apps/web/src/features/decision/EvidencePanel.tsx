import type { DecisionExplanationDto } from '@personal-os/shared';
import { formatPercent, formatPeriod, INSUFFICIENT_DATA } from './format';

interface EvidencePanelProps {
  explanation: DecisionExplanationDto;
  title?: string;
}

function EvidenceList({ label, values }: { label: string; values: readonly string[] }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-xs leading-relaxed text-foreground/85">
        {values.length === 0 ? (
          INSUFFICIENT_DATA
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {values.map((value, index) => (
              <li
                key={`${value}-${index}`}
                className="rounded bg-muted px-2 py-1 text-[11px] break-words"
              >
                {value}
              </li>
            ))}
          </ul>
        )}
      </dd>
    </div>
  );
}

/** Proveniência completa: identificado, dados, cálculo, lacunas e algoritmo. */
export function EvidencePanel({ explanation, title = 'Evidência e cálculo' }: EvidencePanelProps) {
  return (
    <section aria-label={title} className="rounded-lg border border-border bg-background/60 p-4">
      <h4 className="text-sm font-semibold">{title}</h4>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Identificado
          </dt>
          <dd className="mt-1 text-xs leading-relaxed text-foreground/85">
            {explanation.identified || INSUFFICIENT_DATA}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Cálculo
          </dt>
          <dd className="mt-1 text-xs leading-relaxed text-foreground/85">
            {explanation.calculation || INSUFFICIENT_DATA}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Período
          </dt>
          <dd className="mt-1 text-xs text-foreground/85">{formatPeriod(explanation.period)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Confiança
          </dt>
          <dd className="mt-1 text-xs text-foreground/85">
            {formatPercent(explanation.confidence)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            O que não é possível concluir
          </dt>
          <dd className="mt-1 text-xs leading-relaxed text-foreground/85">
            {explanation.cannotConclude || INSUFFICIENT_DATA}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Versão do algoritmo
          </dt>
          <dd className="mt-1 text-xs text-foreground/85">{explanation.algorithmVersion}</dd>
        </div>
        <EvidenceList label="Dados usados" values={explanation.dataUsed} />
        <EvidenceList label="Dados ausentes" values={explanation.missing} />
        <EvidenceList label="Fontes" values={explanation.sources} />
        <EvidenceList label="Limitações" values={explanation.limitations} />
      </dl>
    </section>
  );
}
