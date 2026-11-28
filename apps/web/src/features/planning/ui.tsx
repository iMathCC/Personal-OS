import type { ReactNode } from 'react';
import { EmptyState, ErrorPanel, LoadingPanel } from '@/components/states';
import type { AsyncState } from './use-planning';

interface PageHeaderProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
}

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
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

interface ResourceViewProps<T> {
  readonly state: AsyncState<T>;
  readonly loadingLabel?: string;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly children: (data: T) => ReactNode;
}

export function ResourceView<T>({
  state,
  loadingLabel = 'Carregando dados reais…',
  emptyTitle = 'Nenhum dado registrado',
  emptyDescription = 'Registre informações na API para visualizar este painel.',
  children,
}: ResourceViewProps<T>) {
  if (state.status === 'loading') return <LoadingPanel label={loadingLabel} />;
  if (state.status === 'error') {
    return (
      <ErrorPanel
        title="Não foi possível carregar"
        message={state.error ?? 'Erro desconhecido.'}
        onRetry={state.reload}
      />
    );
  }
  if (state.data === null) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return <>{children(state.data)}</>;
}
