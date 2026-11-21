const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Calcula o próximo alvo de Tab dentro do contêiner, com wrap nas bordas. */
export function nextFocusTarget(
  container: HTMLElement,
  current: HTMLElement | null,
  backwards: boolean,
): HTMLElement | null {
  const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.getClientRects().length > 0,
  );
  const first = items[0] ?? null;
  const last = items[items.length - 1] ?? null;
  if (first === null || last === null) return null;
  if (current === null) return backwards ? last : first;
  const index = items.indexOf(current);
  if (index === -1) return backwards ? last : first;
  if (backwards) return (index === 0 ? last : items[index - 1]) ?? first;
  return (index === items.length - 1 ? first : items[index + 1]) ?? last;
}
