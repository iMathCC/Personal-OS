import { describe, expect, it } from 'vitest';
import type {
  CapacityProfileDto,
  CapacityResultDto,
  ExecutionDashboardData,
  IntelligenceDashboardData,
  TaskDto,
} from '@personal-os/shared';
import {
  addLocalDays,
  buildQuickStudyInput,
  buildQuickTaskInput,
  deriveCapacityRows,
  deriveDailyReview,
  deriveDayIndicators,
  derivePriorityItems,
  greetingFor,
  safeInternalHref,
  taskStatusLabel,
} from '@/features/today/model';

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const INSTANT = '2026-11-23T12:00:00.000Z';

function task(overrides: Partial<TaskDto> = {}): TaskDto {
  return {
    id: TASK_ID,
    title: 'Preparar relatório',
    description: null,
    projectId: null,
    projectTitle: null,
    milestoneId: null,
    milestoneTitle: null,
    goalId: null,
    status: 'todo',
    priority: 'high',
    dueDate: '2026-11-23',
    estimateMinutes: 30,
    completedAt: null,
    version: 3,
    createdAt: INSTANT,
    updatedAt: INSTANT,
    overdue: false,
    dependencyState: 'none',
    blockerIds: [],
    executable: true,
    reason: 'Tarefa elegível',
    ...overrides,
  };
}

function execution(overrides: Partial<ExecutionDashboardData> = {}): ExecutionDashboardData {
  return {
    date: '2026-11-23',
    timezone: 'America/Sao_Paulo',
    generatedAt: INSTANT,
    signals: {
      activeProjects: 2,
      stalledProjects: 1,
      overdueTasks: 1,
      blockedTasks: 1,
      executableTasks: 4,
      completedTasksToday: 2,
      dueToday: 3,
      overdueMilestones: 0,
      projectsWithoutTasks: 0,
    },
    nextAction: {
      taskId: TASK_ID,
      taskTitle: 'Preparar relatório',
      taskStatus: 'todo',
      projectId: null,
      projectTitle: null,
      dueDate: '2026-11-23',
      priority: 'high',
      score: 88,
      reasonCodes: ['DUE_TODAY', 'HIGH_PRIORITY'],
      explanation: 'Vence hoje e tem prioridade alta.',
      algorithmVersion: 'exec-next-v1',
    },
    risks: [
      {
        kind: 'OVERDUE_TASK',
        entityId: TASK_ID,
        title: 'Preparar relatório',
        severity: 'high',
        dueDate: '2026-11-22',
        reasons: ['Prazo anterior à data local.'],
        algorithmVersion: 'exec-risk-v1',
      },
    ],
    projects: [],
    algorithms: {
      progress: 'p-v1',
      activity: 'a-v1',
      blocking: 'b-v1',
      nextAction: 'n-v1',
      risk: 'r-v1',
    },
    truncated: false,
    ...overrides,
  };
}

const capacity: CapacityResultDto = {
  weekStart: '2026-11-23',
  weekEnd: '2026-11-29',
  configuredMinutes: 1200,
  contingencyMinutes: 120,
  unavailableMinutes: 60,
  availableMinutes: 1020,
  committedMinutes: 480,
  remainingMinutes: 540,
  overloadMinutes: 0,
  overloadRatio: null,
  estimatedTaskCount: 8,
  unestimatedTaskCount: 2,
  coverage: 0.8,
  blockedTaskCount: 1,
  skippedCompletedCount: 3,
  skippedCancelledCount: 0,
  byArea: [],
  warnings: ['2 tarefa(s) sem estimativa'],
  algorithmVersion: 'capacity-v1',
};

const profile: CapacityProfileDto = {
  id: 'profile-1',
  weeklyMinutes: 1200,
  contingencyPercent: 10,
  allocations: [],
  preferences: [],
  unavailability: [],
  version: 1,
  createdAt: INSTANT,
  updatedAt: INSTANT,
};

const intelligence: IntelligenceDashboardData = {
  date: '2026-11-23',
  timezone: 'America/Sao_Paulo',
  generatedAt: INSTANT,
  window: { from: '2026-10-26', to: '2026-11-23' },
  metrics: [
    {
      id: 'open_tasks',
      name: 'Tarefas em aberto',
      area: 'tasks',
      kind: 'observed',
      value: 5,
      unit: 'tarefas',
      period: { from: '2026-11-23', to: '2026-11-23' },
      referenceDate: '2026-11-23',
      source: 'tasks',
      coverage: 1,
      confidence: 1,
      algorithmVersion: 'intel-metric-v1',
    },
  ],
  series: [],
  trends: [],
  consistency: [],
  alerts: [],
  recommendations: [],
  projections: [],
  coverage: {
    sources: [
      {
        key: 'health',
        label: 'Saúde',
        recordCount: 0,
        observedDays: 0,
        expectedDays: 28,
        coverageRatio: 0,
        period: null,
        missingFields: [],
      },
    ],
    unconnectedAreas: [],
    formula: 'registros/esperado',
    algorithmVersion: 'intel-coverage-v1',
  },
  currentState: {
    studyMinutes: 0,
    studySessions: 0,
    activeProjects: 2,
    activeGoals: 1,
    relevantTasks: 5,
  },
  sourcesWithData: ['tasks'],
  truncated: true,
  algorithms: {
    metric: 'm-v1',
    trend: 't-v1',
    consistency: 'c-v1',
    alert: 'al-v1',
    recommendation: 're-v1',
    projection: 'pr-v1',
    coverage: 'co-v1',
  },
};

describe('centro de operação diária — modelo puro', () => {
  it('saudação e data usam o fuso da conta', () => {
    expect(greetingFor('America/Sao_Paulo', new Date('2026-11-23T14:00:00.000Z'))).toBe('Bom dia');
    expect(greetingFor('America/Sao_Paulo', new Date('2026-11-23T22:00:00.000Z'))).toBe(
      'Boa noite',
    );
    expect(greetingFor('fuso-invalido', new Date('2026-11-23T14:00:00.000Z'))).toBe('Bom dia');
  });

  it('distingue carregando, indisponível, vazio e pronto sem inventar zero', () => {
    const loading = deriveDayIndicators({
      execution: null,
      executionLoading: true,
      capacity: null,
      capacityLoading: true,
      alertCount: null,
      alertsLoading: true,
    });
    expect(loading.every((item) => item.state === 'loading' && item.value === null)).toBe(true);

    const unavailable = deriveDayIndicators({
      execution: null,
      executionLoading: false,
      capacity: null,
      capacityLoading: false,
      alertCount: null,
      alertsLoading: false,
    });
    expect(unavailable.every((item) => item.state === 'unavailable' && item.value === null)).toBe(
      true,
    );

    const ready = deriveDayIndicators({
      execution: execution(),
      executionLoading: false,
      capacity,
      capacityLoading: false,
      alertCount: 0,
      alertsLoading: false,
    });
    expect(ready.find((item) => item.id === 'pending')?.value).toBe(5);
    expect(ready.find((item) => item.id === 'due-today')?.value).toBe(3);
    expect(ready.find((item) => item.id === 'alerts')).toMatchObject({
      value: 0,
      state: 'empty',
    });
  });

  it('prioriza com origem, remove duplicatas e não sugere tarefa bloqueada', () => {
    const items = derivePriorityItems({
      execution: execution(),
      tasks: [task()],
      nextActions: [],
      alerts: [],
      intelligence: null,
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: `task:${TASK_ID}`,
      kind: 'next-action',
      taskId: TASK_ID,
      version: 3,
      declaredPriority: 'high',
      calculatedScore: 88,
      href: `/tarefas?taskId=${TASK_ID}`,
    });
    expect(items[0]?.source).toContain('execução');

    const blocked = derivePriorityItems({
      execution: execution(),
      tasks: [task({ executable: false, dependencyState: 'blocked' })],
      nextActions: [],
      alerts: [],
      intelligence: null,
    });
    expect(blocked.some((item) => item.kind === 'next-action')).toBe(false);
  });

  it('aceita apenas destinos internos mesmo quando a API devolve href externo', () => {
    expect(safeInternalHref('/objetivos/123', '/inteligencia')).toBe('/objetivos/123');
    expect(safeInternalHref('https://externo.invalid', '/inteligencia')).toBe('/inteligencia');
    expect(safeInternalHref('//externo.invalid', '/inteligencia')).toBe('/inteligencia');
    expect(safeInternalHref(null, '/inteligencia')).toBe('/inteligencia');
  });

  it('apresenta capacidade declarada separada de compromisso estimado', () => {
    const missing = deriveCapacityRows(null, null, false);
    expect(missing.limitation).toContain('Nenhum horário ou tempo realizado foi inventado');

    const rows = deriveCapacityRows(capacity, profile, false);
    expect(rows.rows.find((row) => row.label === 'Capacidade declarada')?.value).toBe(
      '1.200 min/semana',
    );
    expect(rows.rows.find((row) => row.label === 'Comprometido')?.detail).toContain(
      'não representa tempo trabalhado',
    );
    expect(rows.warnings).toContain('2 tarefa(s) sem estimativa');
  });

  it('separa fatos, cálculos, recomendações e limitações na revisão diária', () => {
    const indicators = deriveDayIndicators({
      execution: execution(),
      executionLoading: false,
      capacity,
      capacityLoading: false,
      alertCount: 0,
      alertsLoading: false,
    });
    const priorities = derivePriorityItems({
      execution: execution(),
      tasks: [task()],
      nextActions: [],
      alerts: [],
      intelligence,
    });
    const review = deriveDailyReview({
      indicators,
      execution: execution(),
      intelligence,
      capacity,
      priorities,
    });
    expect(review.facts.some((item) => item.startsWith('Vencem hoje: 3'))).toBe(true);
    expect(review.facts.some((item) => item.startsWith('Compromisso semanal'))).toBe(false);
    expect(review.calculations.some((item) => item.includes('pontuação 88'))).toBe(true);
    expect(review.calculations.some((item) => item.includes('Tarefas em aberto: 5'))).toBe(true);
    expect(review.recommendations).toHaveLength(1);
    expect(review.limitations).toContain('Sem registros em Saúde.');
    expect(review.limitations).toContain(
      'A consulta foi parcial; faltam dados para uma conclusão completa.',
    );
  });

  it('valida captura rápida antes de mutar e preserva rascunho inválido', () => {
    const validTask = buildQuickTaskInput({
      title: 'Revisar orçamento',
      priority: 'high',
      dueDate: '2026-11-23',
      projectId: '',
      goalId: '',
      estimateMinutes: '25',
    });
    expect(validTask.ok).toBe(true);
    if (validTask.ok) {
      expect(validTask.value).toMatchObject({
        title: 'Revisar orçamento',
        estimateMinutes: 25,
        dependencyIds: [],
      });
    }

    const invalidTask = buildQuickTaskInput({
      title: '',
      priority: 'medium',
      dueDate: '2026-11-23',
      projectId: '',
      goalId: '',
      estimateMinutes: '',
    });
    expect(invalidTask.ok).toBe(false);

    const validStudy = buildQuickStudyInput(
      { topic: 'Álgebra linear', durationMinutes: '45' },
      'America/Sao_Paulo',
      new Date(INSTANT),
    );
    expect(validStudy.ok).toBe(true);
    if (validStudy.ok) {
      expect(validStudy.value).toMatchObject({
        topic: 'Álgebra linear',
        durationMinutes: 45,
        timezone: 'America/Sao_Paulo',
      });
    }

    const invalidStudy = buildQuickStudyInput(
      { topic: '', durationMinutes: '0' },
      'America/Sao_Paulo',
      new Date(INSTANT),
    );
    expect(invalidStudy.ok).toBe(false);
  });

  it('não sugere ação de decisão com bloqueios não resolvidos', () => {
    const items = derivePriorityItems({
      execution: execution({ nextAction: null, risks: [] }),
      tasks: [task()],
      alerts: [],
      nextActions: [
        {
          id: 'action-1',
          kind: 'task',
          title: 'Ação com bloqueio',
          why: 'Dependência pendente',
          goalId: null,
          projectId: null,
          expectedImpact: 'Impacto',
          effortMinutes: 10,
          blockers: ['dependência não resolvida'],
          sources: [],
          confidence: 0.5,
          explanation: {
            identified: 'Identificado',
            dataUsed: [],
            calculation: 'Cálculo',
            missing: [],
            period: { from: '2026-11-23', to: '2026-11-23' },
            algorithmVersion: 'dec-v1',
            confidence: 0.5,
            cannotConclude: 'Não conclui',
            limitations: [],
            sources: [],
          },
          algorithmVersion: 'dec-v1',
        },
      ],
      intelligence: null,
    });
    expect(items).toHaveLength(0);
  });

  it('expõe taskStatus na prioridade para ações rápidas', () => {
    const items = derivePriorityItems({
      execution: execution(),
      tasks: [task({ status: 'todo' })],
      nextActions: [],
      alerts: [],
      intelligence: null,
    });
    expect(items[0]?.taskStatus).toBe('todo');
  });

  it('calcula adiamento local por data sem depender de fuso do servidor', () => {
    expect(addLocalDays('2026-11-23', 1)).toBe('2026-11-24');
    expect(addLocalDays('2026-11-30', 1)).toBe('2026-12-01');
  });

  it('rotula status de tarefa de forma legível', () => {
    expect(taskStatusLabel('todo')).toBe('A fazer');
    expect(taskStatusLabel('in_progress')).toBe('Em andamento');
    expect(taskStatusLabel('completed')).toBe('Concluída');
  });

  it('separa planejado, executado e pendente na revisão diária', () => {
    const indicators = deriveDayIndicators({
      execution: execution(),
      executionLoading: false,
      capacity,
      capacityLoading: false,
      alertCount: 0,
      alertsLoading: false,
    });
    const priorities = derivePriorityItems({
      execution: execution(),
      tasks: [task()],
      nextActions: [],
      alerts: [],
      intelligence,
    });
    const review = deriveDailyReview({
      indicators,
      execution: execution(),
      intelligence,
      capacity,
      priorities,
      tasks: [
        task({ id: TASK_ID, title: 'Prevista', dueDate: '2026-11-23', status: 'todo' }),
        task({
          id: '22222222-2222-4222-8222-222222222222',
          title: 'Feita',
          status: 'completed',
          completedAt: INSTANT,
        }),
        task({
          id: '33333333-3333-4333-8333-333333333333',
          title: 'Atrasada',
          dueDate: '2026-11-20',
          overdue: true,
          status: 'todo',
        }),
      ],
      today: '2026-11-23',
    });
    expect(review.planned.some((i) => i.includes('Prevista'))).toBe(true);
    expect(review.executed.some((i) => i.includes('Feita'))).toBe(true);
    expect(review.pending.some((i) => i.includes('Atrasada'))).toBe(true);
  });

  it('revisão diária sem evidência suficiente mantém limitações honestas', () => {
    const review = deriveDailyReview({
      indicators: [],
      execution: null,
      intelligence: null,
      capacity: null,
      priorities: [],
      tasks: [],
      today: '2026-11-23',
    });
    expect(review.recommendations).toHaveLength(0);
    expect(review.limitations.length).toBeGreaterThan(0);
  });
});
