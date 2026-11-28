import type { ReactNode } from 'react';
import { Link } from 'react-router';

const LINKS = [
  { to: '/inteligencia/vida', label: 'Painel de vida' },
  { to: '/inteligencia/alertas', label: 'Alertas' },
  { to: '/inteligencia/decisoes', label: 'Decisões' },
  { to: '/inteligencia/revisoes', label: 'Revisões' },
];

/** Cabeçalho compartilhado: cada página mantém links explícitos para as demais. */
export function DecisionPageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section>
      <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      <nav aria-label="Seções de decisão" className="mt-4 flex flex-wrap gap-2">
        {LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="inline-flex min-h-11 items-center rounded-md border border-border bg-background px-3 text-sm text-foreground hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      {children}
    </section>
  );
}
