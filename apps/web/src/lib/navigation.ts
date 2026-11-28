export type NavigationKey =
  | 'overview'
  | 'today'
  | 'goals'
  | 'projects'
  | 'tasks'
  | 'execution'
  | 'intelligence'
  | 'review'
  | 'dailyReview'
  | 'observations'
  | 'strategy'
  | 'planning'
  | 'cycles'
  | 'capacity'
  | 'scenarios'
  | 'studies'
  | 'career'
  | 'finance'
  | 'health'
  | 'training'
  | 'knowledge'
  | 'time'
  | 'imports'
  | 'integration'
  | 'settings'
  // Ícones já existentes em components/icons.tsx, reaproveitados nas rotas de decisão.
  | 'refresh'
  | 'shield'
  | 'arrow'
  | 'clock'
  // Desempenho longitudinal: cinco seções com ícones próprios.
  | 'performance'
  | 'performanceDomains'
  | 'performanceExecution'
  | 'performancePatterns'
  | 'performanceReviews'
  | 'adaptation';

export type NavigationGroupId = 'core' | 'life' | 'system';

/** Estado real do módulo, derivado do roadmap — nunca de dados simulados. */
export type ModuleAvailability = 'available' | 'not-configured' | 'planned';

export interface NavigationItem {
  readonly key: NavigationKey;
  readonly label: string;
  readonly path: string;
  readonly group: NavigationGroupId;
  readonly availability: ModuleAvailability;
  readonly description: string;
}

export interface NavigationGroup {
  readonly id: NavigationGroupId;
  readonly label: string;
  readonly items: readonly NavigationItem[];
}

export const NAVIGATION_GROUPS: readonly NavigationGroup[] = [
  {
    id: 'core',
    label: 'Núcleo',
    items: [
      {
        key: 'overview',
        label: 'Visão geral',
        path: '/',
        group: 'core',
        availability: 'available',
        description: 'Panorama do estado atual e dos próximos passos.',
      },
      {
        key: 'today',
        label: 'Hoje',
        path: '/hoje',
        group: 'core',
        availability: 'available',
        description: 'Central de operação diária: prioridades, execução, capacidade e registro.',
      },
      {
        key: 'goals',
        label: 'Objetivos',
        path: '/objetivos',
        group: 'core',
        availability: 'available',
        description: 'Objetivos hierárquicos com horizonte, prazo e critério de sucesso.',
      },
      {
        key: 'projects',
        label: 'Projetos',
        path: '/projetos',
        group: 'core',
        availability: 'available',
        description: 'Projetos com marcos, vínculo a objetivos e progresso derivado de tarefas.',
      },
      {
        key: 'tasks',
        label: 'Tarefas',
        path: '/tarefas',
        group: 'core',
        availability: 'available',
        description: 'Tarefas com prazos, dependências e conclusão registrada.',
      },
      {
        key: 'execution',
        label: 'Execução',
        path: '/execucao',
        group: 'core',
        availability: 'available',
        description: 'Sinais derivados de projetos e tarefas, próxima ação e linha do tempo.',
      },
      {
        key: 'intelligence',
        label: 'Inteligência',
        path: '/inteligencia',
        group: 'core',
        availability: 'available',
        description: 'Métricas, tendências, alertas e projeções a partir de registros reais.',
      },
      {
        key: 'refresh',
        label: 'Painel de vida',
        path: '/inteligencia/vida',
        group: 'core',
        availability: 'available',
        description: 'Fatos e indicadores integrados, com lacunas e limites explícitos.',
      },
      {
        key: 'shield',
        label: 'Alertas de decisão',
        path: '/inteligencia/alertas',
        group: 'core',
        availability: 'available',
        description: 'Alertas filtráveis, com evidência e decisão explícita sobre cada sinal.',
      },
      {
        key: 'arrow',
        label: 'Decisões',
        path: '/inteligencia/decisoes',
        group: 'core',
        availability: 'available',
        description: 'Recomendações ranqueadas, prioridades e próximas ações com evidência.',
      },
      {
        key: 'clock',
        label: 'Revisões de desempenho',
        path: '/inteligencia/revisoes',
        group: 'core',
        availability: 'available',
        description: 'Revisões semanais, mensais e trimestrais com observação e cálculo separados.',
      },
      {
        key: 'performance',
        label: 'Desempenho',
        path: '/desempenho',
        group: 'core',
        availability: 'available',
        description: 'Visão longitudinal com fatos, cálculos, hipóteses e simulações separados.',
      },
      {
        key: 'performanceDomains',
        label: 'Domínios de desempenho',
        path: '/desempenho/domínios',
        group: 'core',
        availability: 'available',
        description: 'Evolução por domínio com amostra mínima, lacunas e evidência explícita.',
      },
      {
        key: 'performanceExecution',
        label: 'Execução de desempenho',
        path: '/desempenho/execução',
        group: 'core',
        availability: 'available',
        description:
          'Planejado versus executado, estimativas, tempo medido e capacidade declarada.',
      },
      {
        key: 'performancePatterns',
        label: 'Padrões de desempenho',
        path: '/desempenho/padrões',
        group: 'core',
        availability: 'available',
        description:
          'Padrões descriptivos, associações sem causalidade e simulações transparentes.',
      },
      {
        key: 'performanceReviews',
        label: 'Consolidações de desempenho',
        path: '/desempenho/revisões',
        group: 'core',
        availability: 'available',
        description: 'Revisões mensais e trimestrais com snapshot imutável e versionado.',
      },
      {
        key: 'adaptation',
        label: 'Adaptação',
        path: '/adaptacao',
        group: 'core',
        availability: 'available',
        description: 'Propostas de adaptação, simulações e decisões explícitas com evidência.',
      },
      {
        key: 'review',
        label: 'Revisão semanal',
        path: '/revisao',
        group: 'core',
        availability: 'available',
        description: 'Revisão determinística da semana, com reflexões opcionais e histórico.',
      },
      {
        key: 'dailyReview',
        label: 'Revisão diária',
        path: '/revisao-diaria',
        group: 'core',
        availability: 'available',
        description: 'Encerramento do dia com fatos, cálculos e recomendações separados.',
      },
      {
        key: 'observations',
        label: 'Observações',
        path: '/observacoes',
        group: 'core',
        availability: 'available',
        description: 'Registro de fatos, resultados e inferências com evidência e histórico.',
      },
      {
        key: 'strategy',
        label: 'Estratégia',
        path: '/estrategia',
        group: 'core',
        availability: 'available',
        description: 'Visão versionada, princípios, resultados desejados e áreas prioritárias.',
      },
      {
        key: 'planning',
        label: 'Planejamento',
        path: '/planejamento',
        group: 'core',
        availability: 'available',
        description: 'Priorização explicável, trade-offs e integração com Inteligência.',
      },
      {
        key: 'cycles',
        label: 'Ciclos',
        path: '/ciclos',
        group: 'core',
        availability: 'available',
        description: 'Ciclos trimestrais com metas, resultados esperados e revisão final.',
      },
      {
        key: 'capacity',
        label: 'Capacidade',
        path: '/capacidade',
        group: 'core',
        availability: 'available',
        description: 'Capacidade configurada, distribuição por área e reserva para imprevistos.',
      },
      {
        key: 'scenarios',
        label: 'Cenários',
        path: '/cenarios',
        group: 'core',
        availability: 'available',
        description:
          'Simulações hipotéticas comparadas com o estado base, sem alterar dados reais.',
      },
    ],
  },
  {
    id: 'life',
    label: 'Áreas da vida',
    items: [
      {
        key: 'studies',
        label: 'Estudos',
        path: '/estudos',
        group: 'life',
        availability: 'available',
        description: 'Cursos e sessões de estudo com duração e tópico.',
      },
      {
        key: 'career',
        label: 'Carreira',
        path: '/carreira',
        group: 'life',
        availability: 'planned',
        description: 'Competências e projetos profissionais rastreáveis.',
      },
      {
        key: 'finance',
        label: 'Finanças',
        path: '/financas',
        group: 'life',
        availability: 'available',
        description: 'Contas, transações e fluxo de caixa em centavos.',
      },
      {
        key: 'health',
        label: 'Saúde e bem-estar',
        path: '/saude',
        group: 'life',
        availability: 'available',
        description: 'Observações informadas, sem diagnóstico ou interpretação clínica.',
      },
      {
        key: 'training',
        label: 'Treinamento',
        path: '/treinamento',
        group: 'life',
        availability: 'available',
        description: 'Sessões registradas, duração, volume e consistência observada.',
      },
      {
        key: 'knowledge',
        label: 'Leitura',
        path: '/leitura',
        group: 'life',
        availability: 'available',
        description: 'Materiais, sessões e notas de leitura com aprendizados distintos.',
      },
      {
        key: 'time',
        label: 'Tempo',
        path: '/tempo',
        group: 'life',
        availability: 'available',
        description: 'Tempo observado comparado com estimativas e capacidade configurada.',
      },
      {
        key: 'imports',
        label: 'Importações',
        path: '/importacoes',
        group: 'life',
        availability: 'available',
        description: 'Pré-visualização, deduplicação e confirmação explícita de CSV/JSON.',
      },
      {
        key: 'integration',
        label: 'Integração',
        path: '/integracao',
        group: 'life',
        availability: 'available',
        description: 'Relações explícitas entre áreas, com limites e proveniência.',
      },
    ],
  },
  {
    id: 'system',
    label: 'Sistema',
    items: [
      {
        key: 'settings',
        label: 'Configurações',
        path: '/configuracoes',
        group: 'system',
        availability: 'available',
        description: 'Conta, fuso horário, passkeys e sessões ativas.',
      },
    ],
  },
];

export const NAVIGATION_ITEMS: readonly NavigationItem[] = NAVIGATION_GROUPS.flatMap(
  (group) => group.items,
);

export function isPathActive(pathname: string, path: string): boolean {
  return path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * Apenas a rota mais específica deve ser destacada. `isPathActive` continua
 * útil para casamento de prefixo, mas marcar pai e filho gera dois
 * `aria-current="page"` para a mesma página.
 */
export function isCurrentNavigationItem(pathname: string, item: NavigationItem): boolean {
  return findNavigationItem(pathname)?.key === item.key;
}

/** Rotas filhas vencem a pasta pai: /inteligencia/vida não resolve para /inteligencia. */
export function findNavigationItem(pathname: string): NavigationItem | undefined {
  return NAVIGATION_ITEMS.filter((item) => isPathActive(pathname, item.path)).reduce<
    NavigationItem | undefined
  >(
    (best, item) => (best === undefined || item.path.length > best.path.length ? item : best),
    undefined,
  );
}

export function availabilityLabel(availability: ModuleAvailability): string {
  if (availability === 'available') return 'Disponível';
  if (availability === 'not-configured') return 'Não configurada';
  return 'Em preparação';
}
