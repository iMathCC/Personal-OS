import { BrowserRouter } from 'react-router';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icons';
import { AuthScreen } from './AuthScreen';
import { AppShell } from './AppShell';
import { AppRoutes } from './routes';
import { useSession } from '@/features/auth/use-session';

function BootScreen({ label }: { label: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-5 text-sm text-muted-foreground">
      <span className="flex items-center gap-2" role="status">
        <Icon name="shield" size={18} className="text-primary" />
        {label}
      </span>
    </div>
  );
}

interface BootErrorProps {
  message: string;
  onRetry: () => void;
}

function BootError({ message, onRetry }: BootErrorProps) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-5">
      <div
        className="w-full max-w-md rounded-xl border border-destructive/40 bg-card p-6"
        role="alert"
      >
        <h1 className="text-base font-semibold text-destructive">Não foi possível iniciar</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <Button type="button" className="mt-4 min-h-11" onClick={onRetry}>
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}

export function App() {
  const session = useSession();
  const state = session.state;

  if (state.status === 'loading') {
    return <BootScreen label="Verificando sessão…" />;
  }

  if (state.status === 'error') {
    return <BootError message={state.message} onRetry={() => void session.refresh()} />;
  }

  if (state.status === 'anonymous') {
    return <AuthScreen onAuthenticated={session.refresh} />;
  }

  const account = { user: state.user, counts: state.counts };

  return (
    <BrowserRouter>
      <AppShell user={account.user} onSignOut={() => session.signOut(false)}>
        <AppRoutes account={account} onSignOut={session.signOut} />
      </AppShell>
    </BrowserRouter>
  );
}
