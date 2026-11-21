export type NavigationKey =
  | 'overview'
  | 'goals'
  | 'projects'
  | 'studies'
  | 'career'
  | 'finance'
  | 'health'
  | 'training'
  | 'knowledge'
  | 'settings';

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
        key: 'goals',
        label: 'Objetivos',
        path: '/objetivos',
        group: 'core',
        availability: 'not-configured',
        description: 'Objetivos hierárquicos com horizonte, prazo e critério de sucesso.',
      },
      {
        key: 'projects',
        label: 'Projetos e tarefas',
        path: '/projetos',
        group: 'core',
        availability: 'not-configured',
        description: 'Planejamento diário, semanal e mensal de projetos e tarefas.',
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
        availability: 'planned',
        description: 'Contas, transações e fluxo de caixa em centavos.',
      },
      {
        key: 'health',
        label: 'Saúde e bem-estar',
        path: '/saude',
        group: 'life',
        availability: 'planned',
        description: 'Sono, humor, energia, estresse e hábitos.',
      },
      {
        key: 'training',
        label: 'Treinamento',
        path: '/treinamento',
        group: 'life',
        availability: 'planned',
        description: 'Treinos, exercícios, séries e progressão de carga.',
      },
      {
        key: 'knowledge',
        label: 'Conhecimento',
        path: '/conhecimento',
        group: 'life',
        availability: 'planned',
        description: 'Leituras e retenção do que foi aprendido.',
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

export function findNavigationItem(pathname: string): NavigationItem | undefined {
  return NAVIGATION_ITEMS.find((item) => isPathActive(pathname, item.path));
}

export function availabilityLabel(availability: ModuleAvailability): string {
  if (availability === 'available') return 'Disponível';
  if (availability === 'not-configured') return 'Não configurada';
  return 'Em preparação';
}
