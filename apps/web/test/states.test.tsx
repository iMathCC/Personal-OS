import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EmptyState, ErrorPanel, LoadingPanel } from '@/components/states';

describe('estados de interface', () => {
  it('marca carregamento como ocupado e anuncia o motivo', () => {
    const html = renderToStaticMarkup(<LoadingPanel label="Carregando dados…" />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain('Carregando dados…');
  });

  it('expõe erro com papel de alerta e ação de repetir', () => {
    const html = renderToStaticMarkup(
      <ErrorPanel title="Falha" message="API indisponível" onRetry={() => undefined} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('API indisponível');
    expect(html).toContain('Tentar novamente');
  });

  it('explica o estado vazio sem sugerir dados fictícios', () => {
    const html = renderToStaticMarkup(
      <EmptyState
        eyebrow="Sem dados"
        title="Nada a mostrar"
        description="Nenhum registro foi carregado."
      />,
    );
    expect(html).toContain('Nada a mostrar');
    expect(html).toContain('Nenhum registro foi carregado.');
    expect(html).not.toContain('R$');
  });
});
