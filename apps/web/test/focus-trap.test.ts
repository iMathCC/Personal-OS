import { describe, expect, it } from 'vitest';
import { nextFocusTarget } from '@/app/focus-trap';

interface FakeElement {
  tag: string;
  attrs: Record<string, string>;
  getClientRects: () => unknown[];
}

function link(href = '/'): FakeElement {
  return { tag: 'a', attrs: { href }, getClientRects: () => [{}] };
}

function hidden(): FakeElement {
  return { tag: 'a', attrs: { href: '/hidden' }, getClientRects: () => [] };
}

function container(...items: FakeElement[]): HTMLElement {
  return {
    querySelectorAll: () => items,
  } as unknown as HTMLElement;
}

function asElement(value: FakeElement): HTMLElement {
  return value as unknown as HTMLElement;
}

describe('focus trap do drawer', () => {
  const first = link('/');
  const second = link('/configuracoes');
  const third = link('/objetivos');
  const dialog = container(first, hidden(), second, third);

  it('inicia no primeiro elemento ao abrir e no último ao voltar', () => {
    expect(nextFocusTarget(dialog, null, false)).toBe(first);
    expect(nextFocusTarget(dialog, null, true)).toBe(third);
  });

  it('avança entre elementos e faz wrap no fim', () => {
    expect(nextFocusTarget(dialog, asElement(first), false)).toBe(second);
    expect(nextFocusTarget(dialog, asElement(second), false)).toBe(third);
    expect(nextFocusTarget(dialog, asElement(third), false)).toBe(first);
  });

  it('retrocede entre elementos e faz wrap no início', () => {
    expect(nextFocusTarget(dialog, asElement(third), true)).toBe(second);
    expect(nextFocusTarget(dialog, asElement(second), true)).toBe(first);
    expect(nextFocusTarget(dialog, asElement(first), true)).toBe(third);
  });

  it('ignora elementos fora do contêiner', () => {
    const outside = link('/fora');
    expect(nextFocusTarget(dialog, asElement(outside), false)).toBe(first);
    expect(nextFocusTarget(dialog, asElement(outside), true)).toBe(third);
  });

  it('não retorna alvo quando não há elementos visíveis', () => {
    expect(nextFocusTarget(container(hidden()), null, false)).toBeNull();
  });
});
