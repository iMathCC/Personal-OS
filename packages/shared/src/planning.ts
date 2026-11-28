import { z } from 'zod';
import { successSchema } from './auth';

const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data local inválida.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Data local inválida.');

const instant = z.iso.datetime({ offset: false });
const text = (max: number) => z.string().min(1).max(max);
const nullableText = (max: number) => z.string().max(max).nullable();

export const strategicHorizonSchema = z.enum(['short', 'medium', 'long']);
export const cycleStatusSchema = z.enum(['planned', 'active', 'paused', 'completed', 'cancelled']);
export const lifecycleStatusSchema = z.enum(['active', 'archived']);

/** Rotas de leitura sem parâmetros: qualquer chave extra é rejeitada. */
export const planningEmptyQuerySchema = z.object({}).strict();

/* ------------------------------------------------------------------ Visão */

export const lifeVisionDtoSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  statement: nullableText(4_000),
  horizonYears: z.number().int().min(1).max(50).nullable(),
  principles: z.array(z.string().max(500)),
  desiredOutcomes: z.array(z.string().max(500)),
  status: z.enum(['draft', 'active', 'superseded']),
  sourceId: z.string(),
  createdAt: instant,
  updatedAt: instant,
});
export type LifeVisionDto = z.infer<typeof lifeVisionDtoSchema>;

export const visionHistoryDtoSchema = z.object({
  items: z.array(lifeVisionDtoSchema),
  truncated: z.boolean(),
});
export type VisionHistoryDto = z.infer<typeof visionHistoryDtoSchema>;

export const createVisionRequestSchema = z
  .object({
    statement: nullableText(4_000).optional(),
    horizonYears: z.number().int().min(1).max(50).nullable().optional(),
    principles: z.array(z.string().min(1).max(500)).max(30).optional(),
    desiredOutcomes: z.array(z.string().min(1).max(500)).max(30).optional(),
    status: z.enum(['draft', 'active']).optional(),
  })
  .strict();
export type CreateVisionRequest = z.infer<typeof createVisionRequestSchema>;

/** Toda atualização gera uma versão nova; a anterior permanece como `superseded`. */
export const updateVisionRequestSchema = z
  .object({
    statement: nullableText(4_000).optional(),
    horizonYears: z.number().int().min(1).max(50).nullable().optional(),
    principles: z.array(z.string().min(1).max(500)).max(30).optional(),
    desiredOutcomes: z.array(z.string().min(1).max(500)).max(30).optional(),
    status: z.enum(['draft', 'active']).optional(),
    changeNote: nullableText(500).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'changeNote'), {
    message: 'Nenhum campo de visão informado.',
  });
export type UpdateVisionRequest = z.infer<typeof updateVisionRequestSchema>;

/* ------------------------------------------------------------------ Áreas */

export const strategicAreaDtoSchema = z.object({
  areaId: z.string(),
  key: z.string(),
  name: z.string(),
  description: nullableText(2_000),
  importance: z.number().int().min(1).max(5),
  status: lifecycleStatusSchema,
  goalCount: z.number().int().nonnegative(),
  activeGoalCount: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  createdAt: instant,
  updatedAt: instant,
});
export type StrategicAreaDto = z.infer<typeof strategicAreaDtoSchema>;

export const createStrategicAreaRequestSchema = z
  .object({
    areaId: z.string().min(1).max(64),
    description: nullableText(2_000).optional(),
    importance: z.number().int().min(1).max(5).optional(),
  })
  .strict();
export type CreateStrategicAreaRequest = z.infer<typeof createStrategicAreaRequestSchema>;

export const updateStrategicAreaRequestSchema = z
  .object({
    description: nullableText(2_000).optional(),
    importance: z.number().int().min(1).max(5).optional(),
    status: lifecycleStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nenhum campo informado.' });
export type UpdateStrategicAreaRequest = z.infer<typeof updateStrategicAreaRequestSchema>;

export const strategicGoalDtoSchema = z.object({
  goalId: z.string(),
  visionId: z.string().nullable(),
  areaId: z.string(),
  horizon: strategicHorizonSchema,
  importance: z.number().int().min(1).max(5),
  reviewCadenceDays: z.number().int().min(7).max(365),
  results: z.array(z.string().max(500)),
  title: z.string(),
  declaredPriority: z.number().int().min(1).max(5),
  goalStatus: z.string(),
  progressPercent: z.number().min(0).max(100).nullable(),
  targetDate: localDate.nullable(),
  version: z.number().int().positive(),
  createdAt: instant,
  updatedAt: instant,
});
export type StrategicGoalDto = z.infer<typeof strategicGoalDtoSchema>;

export const createStrategicGoalRequestSchema = z
  .object({
    goalId: z.string().min(1).max(64),
    visionId: z.string().max(64).nullable().optional(),
    horizon: strategicHorizonSchema.optional(),
    importance: z.number().int().min(1).max(5).optional(),
    reviewCadenceDays: z.number().int().min(7).max(365).optional(),
    results: z.array(z.string().min(1).max(500)).max(20).optional(),
  })
  .strict();
export type CreateStrategicGoalRequest = z.infer<typeof createStrategicGoalRequestSchema>;

export const updateStrategicGoalRequestSchema = z
  .object({
    visionId: z.string().max(64).nullable().optional(),
    horizon: strategicHorizonSchema.optional(),
    importance: z.number().int().min(1).max(5).optional(),
    reviewCadenceDays: z.number().int().min(7).max(365).optional(),
    results: z.array(z.string().min(1).max(500)).max(20).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nenhum campo informado.' });
export type UpdateStrategicGoalRequest = z.infer<typeof updateStrategicGoalRequestSchema>;

/* ------------------------------------------------------------------ Ciclos */

export const cycleObjectiveDtoSchema = z.object({
  goalId: z.string(),
  title: z.string(),
  areaId: z.string(),
  declaredPriority: z.number().int().min(1).max(5),
  isPriority: z.boolean(),
});
export type CycleObjectiveDto = z.infer<typeof cycleObjectiveDtoSchema>;

export const planningCycleDtoSchema = z.object({
  id: z.string(),
  name: text(200),
  startDate: localDate,
  endDate: localDate,
  theme: nullableText(500),
  expectedResults: z.array(z.string().max(500)),
  priorityProjects: z.array(z.string()),
  successCriteria: z.array(z.string().max(500)),
  status: cycleStatusSchema,
  objectives: z.array(cycleObjectiveDtoSchema),
  hasReview: z.boolean(),
  sourceId: z.string(),
  version: z.number().int().positive(),
  createdAt: instant,
  updatedAt: instant,
});
export type PlanningCycleDto = z.infer<typeof planningCycleDtoSchema>;

const cycleBase = {
  name: text(200),
  startDate: localDate,
  endDate: localDate,
  theme: nullableText(500).optional(),
  expectedResults: z.array(z.string().min(1).max(500)).max(20).optional(),
  priorityProjects: z.array(z.string().min(1).max(64)).max(50).optional(),
  successCriteria: z.array(z.string().min(1).max(500)).max(20).optional(),
  goalIds: z.array(z.string().min(1).max(64)).max(50).optional(),
  priorityGoalIds: z.array(z.string().min(1).max(64)).max(10).optional(),
};

export const createCycleRequestSchema = z
  .object(cycleBase)
  .strict()
  .refine((value) => value.endDate >= value.startDate, {
    path: ['endDate'],
    message: 'A data final não pode anteceder a inicial.',
  });
export type CreateCycleRequest = z.infer<typeof createCycleRequestSchema>;

export const updateCycleRequestSchema = z
  .object({
    ...cycleBase,
    name: text(200).optional(),
    startDate: localDate.optional(),
    endDate: localDate.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nenhum campo informado.' })
  .refine(
    (value) =>
      value.startDate === undefined ||
      value.endDate === undefined ||
      value.endDate >= value.startDate,
    { path: ['endDate'], message: 'A data final não pode anteceder a inicial.' },
  );
export type UpdateCycleRequest = z.infer<typeof updateCycleRequestSchema>;

export const cycleTransitionRequestSchema = z.object({ status: cycleStatusSchema }).strict();
export type CycleTransitionRequest = z.infer<typeof cycleTransitionRequestSchema>;

export const cycleListQuerySchema = z
  .object({
    status: cycleStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    cursor: z.string().max(512).optional(),
  })
  .strict();
export type CycleListQuery = z.infer<typeof cycleListQuerySchema>;

/* -------------------------------------------------------------- Capacidade */

export const capacityAreaConfigDtoSchema = z.object({
  areaId: z.string(),
  percent: z.number().min(0).max(100),
});

export const capacityUnavailabilityDtoSchema = z.object({
  id: z.string(),
  from: localDate,
  to: localDate,
  reason: nullableText(500),
  minutesPerDay: z.number().int().min(0).max(1_440).nullable(),
});

export const capacityProfileDtoSchema = z.object({
  id: z.string(),
  weeklyMinutes: z.number().int().min(0).max(10_000),
  contingencyPercent: z.number().min(0).max(50),
  allocations: z.array(capacityAreaConfigDtoSchema),
  preferences: z.array(z.string().max(500)),
  unavailability: z.array(capacityUnavailabilityDtoSchema),
  version: z.number().int().positive(),
  createdAt: instant,
  updatedAt: instant,
});
export type CapacityProfileDto = z.infer<typeof capacityProfileDtoSchema>;

export const capacityAreaResultDtoSchema = z.object({
  areaId: z.string(),
  allocatedMinutes: z.number(),
  committedMinutes: z.number(),
  remainingMinutes: z.number(),
  estimatedTaskCount: z.number().int().nonnegative(),
  unestimatedTaskCount: z.number().int().nonnegative(),
});

export const capacityResultDtoSchema = z.object({
  weekStart: localDate,
  weekEnd: localDate,
  configuredMinutes: z.number().nonnegative(),
  contingencyMinutes: z.number().nonnegative(),
  unavailableMinutes: z.number().nonnegative(),
  availableMinutes: z.number().nonnegative(),
  committedMinutes: z.number().nonnegative(),
  remainingMinutes: z.number(),
  overloadMinutes: z.number().nonnegative(),
  overloadRatio: z.number().nonnegative().nullable(),
  estimatedTaskCount: z.number().int().nonnegative(),
  unestimatedTaskCount: z.number().int().nonnegative(),
  coverage: z.number().min(0).max(1),
  blockedTaskCount: z.number().int().nonnegative(),
  skippedCompletedCount: z.number().int().nonnegative(),
  skippedCancelledCount: z.number().int().nonnegative(),
  byArea: z.array(capacityAreaResultDtoSchema),
  warnings: z.array(z.string()),
  algorithmVersion: z.string(),
});
export type CapacityResultDto = z.infer<typeof capacityResultDtoSchema>;

export const saveCapacityProfileRequestSchema = z
  .object({
    weeklyMinutes: z.number().int().min(0).max(10_000),
    contingencyPercent: z.number().int().min(0).max(50),
    allocations: z.array(capacityAreaConfigDtoSchema).max(20),
    preferences: z.array(z.string().min(1).max(500)).max(20).optional(),
    unavailability: z
      .array(
        z
          .object({
            from: localDate,
            to: localDate,
            reason: nullableText(500).optional(),
            minutesPerDay: z.number().int().min(0).max(1_440).nullable().optional(),
          })
          .strict()
          .refine((value) => value.to >= value.from, {
            path: ['to'],
            message: 'Período inválido.',
          }),
      )
      .max(50),
  })
  .strict();
export type SaveCapacityProfileRequest = z.infer<typeof saveCapacityProfileRequestSchema>;

export const capacityQuerySchema = z.object({ weekStart: localDate.optional() }).strict();
export type CapacityQuery = z.infer<typeof capacityQuerySchema>;

/* ------------------------------------------------------------ Priorização */

export const planningWeightsSchema = z
  .object({
    importance: z.number().min(0).max(100),
    urgency: z.number().min(0).max(100),
    progressGap: z.number().min(0).max(100),
    dependencies: z.number().min(0).max(100),
    capacity: z.number().min(0).max(100),
    risk: z.number().min(0).max(100),
    contribution: z.number().min(0).max(100),
  })
  .strict();
export type PlanningWeightsDto = z.infer<typeof planningWeightsSchema>;

export const prioritizationReasonDtoSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const prioritizedItemDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(['goal', 'project']),
  declaredPriority: z.number().int().min(1).max(5),
  importance: z.number(),
  dueDate: localDate.nullable(),
  today: localDate,
  progressPercent: z.number().nullable(),
  pendingDependencies: z.number().int().nonnegative(),
  minutes: z.number().nullable(),
  availableMinutes: z.number(),
  risk: z.number(),
  contribution: z.number(),
  score: z.number().int().min(0).max(100),
  suggestedPriority: z.number().int().min(1).max(5),
  reasons: z.array(prioritizationReasonDtoSchema),
  algorithmVersion: z.string(),
});
export type PrioritizedItemDto = z.infer<typeof prioritizedItemDtoSchema>;

export const tradeoffDtoSchema = z.object({
  code: z.string(),
  title: z.string(),
  detail: z.string(),
  itemIds: z.array(z.string()),
});
export type TradeoffDto = z.infer<typeof tradeoffDtoSchema>;

export const prioritizationDtoSchema = z.object({
  items: z.array(prioritizedItemDtoSchema),
  tradeoffs: z.array(tradeoffDtoSchema),
  capacity: capacityResultDtoSchema,
  weights: planningWeightsSchema,
  formula: z.string(),
  limitations: z.array(z.string()),
  generatedAt: instant,
});
export type PrioritizationDto = z.infer<typeof prioritizationDtoSchema>;

export const prioritizationQuerySchema = z
  .object({
    weekStart: localDate.optional(),
    asOf: localDate.optional(),
    cycleId: z.string().max(64).optional(),
  })
  .strict();
export type PrioritizationQuery = z.infer<typeof prioritizationQuerySchema>;

/* ---------------------------------------------------------------- Cenários */

export const scenarioChangeDtoSchema = z
  .object({
    type: z.enum([
      'set_goal_importance',
      'set_capacity',
      'defer_project',
      'set_area_focus',
      'exclude_task',
    ]),
    goalId: z.string().max(64).optional(),
    projectId: z.string().max(64).optional(),
    taskId: z.string().max(64).optional(),
    areaId: z.string().max(64).optional(),
    value: z.number().min(0).max(10_000).optional(),
  })
  .strict();
export type ScenarioChangeDto = z.infer<typeof scenarioChangeDtoSchema>;

export const scenarioDtoSchema = z.object({
  id: z.string(),
  name: text(200),
  hypotheses: nullableText(2_000),
  changes: z.array(scenarioChangeDtoSchema),
  weekStart: localDate,
  result: z.unknown(),
  limitations: z.array(z.string()),
  algorithmVersion: z.string(),
  sourceId: z.string(),
  version: z.number().int().positive(),
  createdAt: instant,
  updatedAt: instant,
});
export type ScenarioDto = z.infer<typeof scenarioDtoSchema>;

export const createScenarioRequestSchema = z
  .object({
    name: text(200),
    hypotheses: nullableText(2_000).optional(),
    changes: z.array(scenarioChangeDtoSchema).min(1).max(20),
    weekStart: localDate.optional(),
  })
  .strict();
export type CreateScenarioRequest = z.infer<typeof createScenarioRequestSchema>;

export const simulateRequestSchema = z
  .object({
    changes: z.array(scenarioChangeDtoSchema).min(1).max(20),
    weekStart: localDate.optional(),
  })
  .strict();
export type SimulateRequest = z.infer<typeof simulateRequestSchema>;

export const simulationResultDtoSchema = z.object({
  weeklyMinutes: z.number().nonnegative(),
  capacity: capacityResultDtoSchema,
  priorities: z.array(prioritizedItemDtoSchema),
  tradeoffs: z.array(tradeoffDtoSchema),
  ignored: z.array(z.string()),
  algorithmVersion: z.string(),
});
export type SimulationResultDto = z.infer<typeof simulationResultDtoSchema>;

export const scenarioComparisonDtoSchema = z.object({
  base: simulationResultDtoSchema,
  scenario: simulationResultDtoSchema,
  deltas: z.object({
    committedMinutes: z.number(),
    remainingMinutes: z.number(),
    overloadMinutes: z.number(),
    coverage: z.number(),
    topPriorityIds: z.array(z.string()),
  }),
  limitations: z.array(z.string()),
});
export type ScenarioComparisonDto = z.infer<typeof scenarioComparisonDtoSchema>;

/* -------------------------------------------------------------- Revisões */

export const quarterlyReflectionDtoSchema = z.object({
  planned: nullableText(2_000).optional(),
  completed: nullableText(2_000).optional(),
  results: nullableText(2_000).optional(),
  changedGoals: nullableText(2_000).optional(),
  pending: nullableText(2_000).optional(),
  incorrectHypotheses: nullableText(2_000).optional(),
  learned: nullableText(2_000).optional(),
  keep: nullableText(2_000).optional(),
  deferOrDrop: nullableText(2_000).optional(),
  nextPriorities: nullableText(2_000).optional(),
});
export type QuarterlyReflectionDto = z.infer<typeof quarterlyReflectionDtoSchema>;

export const quarterlyReviewDtoSchema = z.object({
  id: z.string(),
  cycleId: z.string(),
  cycleName: z.string(),
  snapshot: z.unknown(),
  reflections: quarterlyReflectionDtoSchema,
  status: z.enum(['saved', 'updated']),
  version: z.number().int().positive(),
  createdAt: instant,
  updatedAt: instant,
});
export type QuarterlyReviewDto = z.infer<typeof quarterlyReviewDtoSchema>;

export const createQuarterlyReviewRequestSchema = z
  .object({
    cycleId: z.string().min(1).max(64),
    reflections: quarterlyReflectionDtoSchema.optional(),
  })
  .strict();
export type CreateQuarterlyReviewRequest = z.infer<typeof createQuarterlyReviewRequestSchema>;

export const updateQuarterlyReviewRequestSchema = z
  .object({ reflections: quarterlyReflectionDtoSchema })
  .strict();
export type UpdateQuarterlyReviewRequest = z.infer<typeof updateQuarterlyReviewRequestSchema>;

/* ---------------------------------------------------------- Painel integrado */

export const strategyDashboardDtoSchema = z.object({
  date: localDate,
  timezone: z.string(),
  vision: lifeVisionDtoSchema.nullable(),
  areas: z.array(strategicAreaDtoSchema),
  availableAreas: z.array(z.object({ id: z.string(), key: z.string(), name: z.string() })),
  availableGoals: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      areaId: z.string(),
      priority: z.number().int().min(1).max(5),
      status: z.string(),
    }),
  ),
  strategicGoals: z.array(strategicGoalDtoSchema),
  currentCycle: planningCycleDtoSchema.nullable(),
  cycles: z.array(planningCycleDtoSchema),
  capacity: capacityResultDtoSchema.nullable(),
  prioritization: prioritizationDtoSchema.nullable(),
  scenarios: z.array(scenarioDtoSchema),
  reviews: z.array(quarterlyReviewDtoSchema),
  intelligence: z
    .object({
      alerts: z.number().int().nonnegative(),
      recommendations: z.number().int().nonnegative(),
      sourcesWithData: z.array(z.string()),
      truncated: z.boolean(),
      coverage: z.array(z.string()),
    })
    .nullable(),
  truncated: z.boolean(),
  generatedAt: instant,
});
export type StrategyDashboardDto = z.infer<typeof strategyDashboardDtoSchema>;

export const visionListQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(200).optional() })
  .strict();
export type VisionListQuery = z.infer<typeof visionListQuerySchema>;

export const scenarioListQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(200).optional() })
  .strict();
export type ScenarioListQuery = z.infer<typeof scenarioListQuerySchema>;

export const lifeVisionResponseSchema = successSchema(lifeVisionDtoSchema);
export const planningCycleResponseSchema = successSchema(planningCycleDtoSchema);
export const capacityProfileResponseSchema = successSchema(capacityProfileDtoSchema);
export const capacityResultResponseSchema = successSchema(capacityResultDtoSchema);
export const prioritizationResponseSchema = successSchema(prioritizationDtoSchema);
export const simulationResponseSchema = successSchema(scenarioComparisonDtoSchema);
export const quarterlyReviewResponseSchema = successSchema(quarterlyReviewDtoSchema);
export const strategyDashboardResponseSchema = successSchema(strategyDashboardDtoSchema);
