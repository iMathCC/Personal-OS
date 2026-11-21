import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icons';

interface LoadingPanelProps {
  label: string;
  lines?: number;
}

export function LoadingPanel({ label, lines = 3 }: LoadingPanelProps) {
  return (
    <div aria-busy="true" className="rounded-xl border border-border bg-card p-5" role="status">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-4 space-y-2" aria-hidden="true">
        {Array.from({ length: lines }, (_, index) => (
          <div
            key={index}
            className={index === 0 ? 'h-4 w-2/5 rounded bg-muted' : 'h-3 w-4/5 rounded bg-muted'}
          />
        ))}
      </div>
    </div>
  );
}

interface ErrorPanelProps {
  title: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorPanel({ title, message, onRetry }: ErrorPanelProps) {
  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5" role="alert">
      <h3 className="text-sm font-semibold text-destructive">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button type="button" className="mt-4 min-h-11" onClick={onRetry}>
          <Icon name="refresh" size={16} />
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ eyebrow, title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/60 p-6">
      {eyebrow && (
        <p className="text-[11px] font-medium tracking-[0.14em] text-primary uppercase">
          {eyebrow}
        </p>
      )}
      <h3 className="mt-2 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
