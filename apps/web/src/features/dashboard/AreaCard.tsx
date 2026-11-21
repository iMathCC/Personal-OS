import { Link } from 'react-router';
import { Icon } from '@/components/icons';
import type { NavigationItem } from '@/lib/navigation';
import { areaStatusLabel, type AreaStatus } from './status';

interface AreaCardProps {
  item: NavigationItem;
  status: AreaStatus;
}

const BADGE_CLASS: Record<AreaStatus, string> = {
  active: 'border-primary/30 bg-primary/10 text-primary',
  'no-data': 'border-border bg-muted/60 text-muted-foreground',
  loading: 'border-primary/30 bg-primary/10 text-primary',
  'not-configured': 'border-border bg-muted/60 text-muted-foreground',
  planned: 'border-border bg-muted/60 text-muted-foreground',
};

export function AreaCard({ item, status }: AreaCardProps) {
  return (
    <Link
      to={item.path}
      className="group flex min-h-36 flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-secondary text-muted-foreground group-hover:text-primary">
          <Icon name={item.key} size={18} />
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${BADGE_CLASS[status]}`}
        >
          {areaStatusLabel(status)}
        </span>
      </div>
      <h3 className="mt-4 text-sm font-semibold text-foreground">{item.label}</h3>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        {item.description}
      </p>
      <span className="mt-auto flex items-center gap-1 pt-3 text-[11px] font-medium text-muted-foreground group-hover:text-primary">
        Abrir área
        <Icon name="arrow" size={13} />
      </span>
    </Link>
  );
}
