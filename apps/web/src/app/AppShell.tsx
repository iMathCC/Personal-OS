import type { UserDto } from '@personal-os/shared';
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { NavLink, useLocation } from 'react-router';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  findNavigationItem,
  isCurrentNavigationItem,
  NAVIGATION_GROUPS,
  type NavigationItem,
} from '@/lib/navigation';
import { nextFocusTarget } from './focus-trap';

interface AppShellProps {
  user: UserDto;
  children: ReactNode;
  onSignOut: () => Promise<void>;
}

function NavigationLinks({
  onNavigate,
  firstLinkRef,
}: {
  onNavigate?: () => void;
  firstLinkRef?: RefObject<HTMLAnchorElement | null>;
}) {
  const location = useLocation();

  return (
    <nav aria-label="Navegação principal" className="space-y-6">
      {NAVIGATION_GROUPS.map((group) => (
        <div key={group.id}>
          <p className="px-3 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/80 uppercase">
            {group.label}
          </p>
          <ul className="mt-2 space-y-1">
            {group.items.map((item: NavigationItem) => {
              const active = isCurrentNavigationItem(location.pathname, item);
              return (
                <li key={item.key}>
                  <NavLink
                    to={item.path}
                    end={item.path === '/'}
                    ref={item.key === 'overview' ? firstLinkRef : undefined}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                      active
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                    }`}
                  >
                    <Icon name={item.key} size={18} className="shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {item.availability !== 'available' && (
                      <span
                        className="ml-auto size-1.5 shrink-0 rounded-full bg-muted-foreground/60"
                        title={
                          item.availability === 'planned' ? 'Em preparação' : 'Não configurada'
                        }
                      />
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AppShell({ user, children, onSignOut }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const location = useLocation();
  const firstLink = useRef<HTMLAnchorElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const background = useRef<HTMLDivElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const current = findNavigationItem(location.pathname);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const closeMenuAndRestoreFocus = useCallback(() => {
    closeMenu();
    // Devolve o foco depois de o drawer ser removido do DOM.
    requestAnimationFrame(() => trigger.current?.focus());
  }, [closeMenu]);

  // Fechar o drawer também no back/forward do navegador.
  /* eslint-disable react-hooks/set-state-in-effect -- reação a mudança de rota */
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!menuOpen) return;
    firstLink.current?.focus();
    const container = dialog.current;
    const shell = background.current;
    const side = sidebar.current;
    if (shell) shell.inert = true;
    if (side) side.inert = true;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenuAndRestoreFocus();
        return;
      }
      if (event.key !== 'Tab' || container === null) return;
      const target = nextFocusTarget(
        container,
        document.activeElement instanceof HTMLElement ? document.activeElement : null,
        event.shiftKey,
      );
      if (target === null) return;
      event.preventDefault();
      target.focus();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (shell) shell.inert = false;
      if (side) side.inert = false;
    };
  }, [menuOpen, closeMenuAndRestoreFocus]);

  const firstName = user.displayName.trim().split(/\s+/u)[0] || user.displayName;

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await onSignOut();
    } catch {
      setSignOutError('Não foi possível encerrar a sessão. Tente novamente.');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-dvh overflow-x-hidden bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Ir para o conteúdo
      </a>

      <aside
        ref={sidebar}
        className="fixed inset-y-0 left-0 z-20 hidden w-72 flex-col border-r border-border bg-card/70 px-4 py-6 lg:flex"
      >
        <div className="flex items-center gap-3 px-2">
          <div
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/25"
          >
            <Icon name="shield" size={20} />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">Personal OS</p>
            <p className="text-[11px] text-muted-foreground">Sistema pessoal</p>
          </div>
        </div>

        <div className="mt-8 flex-1 overflow-y-auto">
          <NavigationLinks />
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <p className="truncate px-3 text-xs text-muted-foreground">{firstName}</p>
          {signOutError !== null && (
            <p className="mt-2 px-3 text-xs text-destructive" role="alert">
              {signOutError}
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 min-h-11 w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
          >
            Encerrar sessão
          </Button>
        </div>
      </aside>

      <div ref={background} className="lg:pl-72">
        <header className="sticky top-0 z-10 flex min-h-16 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-sm sm:px-6">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11 lg:hidden"
            aria-label={menuOpen ? 'Fechar navegação' : 'Abrir navegação'}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            ref={trigger}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon name={menuOpen ? 'close' : 'menu'} size={20} />
          </Button>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-primary uppercase">
              {current ? 'Personal OS' : 'Navegação'}
            </p>
            <h1 className="truncate text-sm font-semibold sm:text-base">
              {current?.label ?? 'Página não encontrada'}
            </h1>
          </div>
          <span className="ml-auto hidden text-xs text-muted-foreground sm:block">pt-BR</span>
        </header>

        <main id="main-content" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Fechar navegação"
            className="absolute inset-0 bg-black/70"
            onClick={closeMenuAndRestoreFocus}
          />
          <div
            ref={dialog}
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Navegação"
            className="absolute inset-y-0 left-0 flex w-[min(88vw,20rem)] flex-col border-r border-border bg-card px-4 py-6 shadow-2xl"
          >
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <div
                  aria-hidden="true"
                  className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/25"
                >
                  <Icon name="shield" size={20} />
                </div>
                <div>
                  <p className="text-sm font-semibold">Personal OS</p>
                  <p className="text-[11px] text-muted-foreground">{firstName}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11"
                aria-label="Fechar navegação"
                onClick={closeMenuAndRestoreFocus}
              >
                <Icon name="close" size={20} />
              </Button>
            </div>
            <div className="mt-8 flex-1 overflow-y-auto">
              <NavigationLinks firstLinkRef={firstLink} onNavigate={closeMenu} />
            </div>
            {signOutError !== null && (
              <p className="mt-2 text-xs text-destructive" role="alert">
                {signOutError}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              className="mt-4 min-h-11 w-full"
              onClick={() => {
                closeMenu();
                void handleSignOut();
              }}
              disabled={signingOut}
            >
              Encerrar sessão
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
