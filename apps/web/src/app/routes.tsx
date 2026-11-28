import { Link, Route, Routes } from 'react-router';
import { EmptyState } from '@/components/states';
import { Icon } from '@/components/icons';
import type { AccountSummary } from '@/features/auth/use-session';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import {
  DecisionAlertsPage,
  DecisionDashboardPage,
  DecisionDecisionsPage,
  DecisionReviewsPage,
} from '@/features/decision';
import { ExecutionPage } from '@/features/execution/ExecutionPage';
import { GoalsPage } from '@/features/goals/GoalsPage';
import { IntelligencePage } from '@/features/intelligence/IntelligencePage';
import {
  PerformanceDomainsPage,
  PerformanceExecutionPage,
  PerformancePage,
  PerformancePatternsPage,
  PerformanceReviewsPage,
} from '@/features/performance';
import { AdaptationPage } from '@/features/adaptation';
import { FinancePage } from '@/features/life/FinancePage';
import { HealthPage } from '@/features/life/HealthPage';
import { ImportsPage } from '@/features/life/ImportsPage';
import { IntegrationPage } from '@/features/life/IntegrationPage';
import { ReadingPage } from '@/features/life/ReadingPage';
import { TimePage } from '@/features/life/TimePage';
import { TrainingPage } from '@/features/life/TrainingPage';
import {
  CapacityPage,
  CyclesPage,
  PlanningPage,
  ScenariosPage,
  StrategyPage,
} from '@/features/planning';
import { PlannedPage } from '@/features/planned/PlannedPage';
import { ReviewPage } from '@/features/review/ReviewPage';
import { ProjectsPage } from '@/features/projects/ProjectsPage';
import { StudiesPage } from '@/features/studies/StudiesPage';
import { TasksPage } from '@/features/tasks/TasksPage';
import { DailyReviewPage, TodayPage } from '@/features/today';
import { ObservationsPage } from '@/features/observations/ObservationsPage';
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
      <Route path="/hoje" element={<TodayPage timezone={account.user.timezone} />} />
      <Route
        path="/revisao-diaria"
        element={<DailyReviewPage timezone={account.user.timezone} />}
      />
      <Route path="/observacoes" element={<ObservationsPage account={account} />} />
      <Route path="/estudos" element={<StudiesPage account={account} />} />
      <Route path="/objetivos" element={<GoalsPage account={account} />} />
      <Route path="/projetos" element={<ProjectsPage account={account} />} />
      <Route path="/tarefas" element={<TasksPage account={account} />} />
      <Route path="/execucao" element={<ExecutionPage account={account} />} />
      <Route path="/inteligencia" element={<IntelligencePage timezone={account.user.timezone} />} />
      <Route path="/inteligencia/vida" element={<DecisionDashboardPage />} />
      <Route path="/inteligencia/alertas" element={<DecisionAlertsPage />} />
      <Route path="/inteligencia/decisoes" element={<DecisionDecisionsPage />} />
      <Route path="/inteligencia/revisoes" element={<DecisionReviewsPage />} />
      <Route path="/desempenho" element={<PerformancePage />} />
      <Route path="/desempenho/domínios" element={<PerformanceDomainsPage />} />
      <Route path="/desempenho/execução" element={<PerformanceExecutionPage />} />
      <Route path="/desempenho/padrões" element={<PerformancePatternsPage />} />
      <Route path="/desempenho/revisões" element={<PerformanceReviewsPage />} />
      <Route path="/adaptacao" element={<AdaptationPage />} />
      <Route path="/revisao" element={<ReviewPage timezone={account.user.timezone} />} />
      <Route path="/estrategia" element={<StrategyPage />} />
      <Route path="/planejamento" element={<PlanningPage />} />
      <Route path="/ciclos" element={<CyclesPage />} />
      <Route path="/capacidade" element={<CapacityPage />} />
      <Route path="/cenarios" element={<ScenariosPage />} />
      <Route path="/financas" element={<FinancePage />} />
      <Route path="/saude" element={<HealthPage />} />
      <Route path="/treinamento" element={<TrainingPage />} />
      <Route path="/leitura" element={<ReadingPage />} />
      <Route path="/conhecimento" element={<ReadingPage />} />
      <Route path="/tempo" element={<TimePage />} />
      <Route path="/importacoes" element={<ImportsPage />} />
      <Route path="/integracao" element={<IntegrationPage />} />
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
