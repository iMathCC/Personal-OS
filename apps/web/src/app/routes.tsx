import { Link, Route, Routes } from 'react-router';
import { EmptyState } from '@/components/states';
import { Icon } from '@/components/icons';
import type { AccountSummary } from '@/features/auth/use-session';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { PlannedPage } from '@/features/planned/PlannedPage';
import { StudiesPage } from '@/features/studies/StudiesPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { NAVIGATION_ITEMS, type NavigationItem } from '@/lib/navigation';

interface AppRoutesProps {
  account: AccountSummary;
  onSignOut: (all: boolean) => Promise<void>;
}

function NotFoundPage() {
  return (
    <EmptyState
      eyebrow="404"
      title="Página não encontrada"
      description="O endereço acessado não corresponde a uma área do Personal OS. Volte para a visão geral ou use a navegação."
      action={
        <Link
          to="/"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm text-foreground hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
        >
          Ir para a visão geral
          <Icon name="arrow" size={15} />
        </Link>
      }
    />
  );
}

export function AppRoutes({ account, onSignOut }: AppRoutesProps) {
  const planned = NAVIGATION_ITEMS.filter(
    (item: NavigationItem) => item.availability !== 'available',
  );

  return (
    <Routes>
      <Route path="/" element={<DashboardPage account={account} />} />
      <Route path="/estudos" element={<StudiesPage account={account} />} />
      <Route
        path="/configuracoes"
        element={<SettingsPage account={account} onSignOut={onSignOut} />}
      />
      {planned.map((item) => (
        <Route key={item.key} path={item.path} element={<PlannedPage item={item} />} />
      ))}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
