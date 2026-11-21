import { Link } from 'react-router';
import { EmptyState } from '@/components/states';
import { Icon } from '@/components/icons';
import type { NavigationItem } from '@/lib/navigation';

interface PlannedPageProps {
  item: NavigationItem;
}

export function PlannedPage({ item }: PlannedPageProps) {
  const notConfigured = item.availability === 'not-configured';

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
          {notConfigured ? 'Não configurada' : 'Em preparação'}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">{item.label}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Esta área está representada na navegação para mostrar o mapa do produto. Nenhum
          funcionamento foi simulado: não há dados, indicadores ou ações disponíveis aqui nesta
          entrega.
        </p>
      </div>

      <EmptyState
        eyebrow={notConfigured ? 'Estrutura pendente' : 'Módulo previsto'}
        title={notConfigured ? 'Estrutura ainda não configurada' : 'Módulo em preparação'}
        description={`${item.description} O módulo será implementado em uma entrega futura, sem dados fictícios nem indicadores calculados a partir de exemplos.`}
        action={
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm text-foreground hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          >
            Voltar para a visão geral
            <Icon name="arrow" size={15} />
          </Link>
        }
      />
    </div>
  );
}
