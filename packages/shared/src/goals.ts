import { z } from 'zod';
import { successSchema } from './auth';
import { goalProgressSchema } from './studies';

const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data local inválida.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Data local inválida.');

const instant = z.iso.datetime({ offset: false });
const nullableText = z.string().max(2_000).nullable();
const goalStatus = z.enum(['draft', 'active', 'paused', 'achieved', 'cancelled']);
const goalHorizon = z.enum(['short', 'medium', 'long']);
const milestoneStatus = z.enum(['pending', 'in_progress', 'completed', 'cancelled']);

export const goalAreaDtoSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
});
export type GoalAreaDto = z.infer<typeof goalAreaDtoSchema>;
export const goalAreasResponseSchema = successSchema(z.array(goalAreaDtoSchema));

export const goalAttentionReasonSchema = z.object({
  code: z.enum([
    'OVERDUE',
    'DUE_TODAY',
    'DUE_SOON',
    'HIGH_PRIORITY',
    'STALE',
    'LOW_PROGRESS_NEAR_DEADLINE',
    'PENDING_MILESTONES',
  ]),
  message: z.string(),
});

export const goalAttentionSchema = z.object({
  score: z.number().int().min(0).max(100),
  level: z.enum(['none', 'low', 'medium', 'high']),
  reasons: z.array(goalAttentionReasonSchema),
  algorithmVersion: z.string(),
});
export type GoalAttentionDto = z.infer<typeof goalAttentionSchema>;

export const goalMilestoneDtoSchema = z.object({
  id: z.string(),
  goalId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  dueDate: localDate.nullable(),
  status: milestoneStatus,
  completedAt: instant.nullable(),
  version: z.number().int().positive(),
  createdAt: instant,
  updatedAt: instant,
});
export type GoalMilestoneDto = z.infer<typeof goalMilestoneDtoSchema>;

export const goalStudyLinkSchema = z.object({
  /** `false` quando o objetivo não usa a métrica canônica de minutos de estudo. */
  linked: z.boolean(),
  areaKey: z.string().nullable(),
  metricKey: z.string().nullable(),
  window: z.object({ from: localDate, to: localDate }),
  minutes: z.number().nonnegative(),
  sessionCount: z.number().int().nonnegative(),
  lastActivityDate: localDate.nullable(),
  targetMinutes: z.number().positive().nullable(),
  /** `true` se a leitura de observações atingiu o teto. */
  truncated: z.boolean(),
});
export type GoalStudyLinkDto = z.infer<typeof goalStudyLinkSchema>;

export const lifeGoalDtoSchema = z.object({
  id: z.string(),
  areaId: z.string(),
  areaKey: z.string(),
  areaName: z.string(),
  parentGoalId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  horizon: goalHorizon,
  status: goalStatus,
  priority: z.number().int().min(1).max(5),
  startDate: localDate.nullable(),
  targetDate: localDate.nullable(),
  successCriteria: z.string().nullable(),
  progressMode: z.enum(['manual', 'metrics', 'tasks', 'hybrid']),
  manualProgress: z.number().min(0).max(100).nullable(),
  progress: goalProgressSchema,
  milestoneCount: z.number().int().nonnegative(),
  pendingMilestoneCount: z.number().int().nonnegative(),
  attention: goalAttentionSchema,
  studyLink: goalStudyLinkSchema,
  achievedAt: instant.nullable(),
  archivedAt: instant.nullable(),
  sourceId: z.string(),
  version: z.number().int().positive(),
  createdAt: instant,
  updatedAt: instant,
});
export type LifeGoalDto = z.infer<typeof lifeGoalDtoSchema>;

export const goalHistoryChangeSchema = z.object({
  field: z.string(),
  from: z.string().nullable(),
  to: z.string().nullable(),
});

export const goalHistoryEntrySchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(['create', 'update', 'delete', 'restore']),
  createdAt: instant,
  changes: z.array(goalHistoryChangeSchema),
});
export type GoalHistoryEntryDto = z.infer<typeof goalHistoryEntrySchema>;

export const goalDetailSchema = z.object({
  goal: lifeGoalDtoSchema,
  milestones: z.array(goalMilestoneDtoSchema),
  history: z.array(goalHistoryEntrySchema),
});
export type GoalDetailDto = z.infer<typeof goalDetailSchema>;
export const goalDetailResponseSchema = successSchema(goalDetailSchema);

export const goalListQuerySchema = z
  .object({
    area: z.string().max(64).optional(),
    status: goalStatus.optional(),
    sort: z.enum(['priority', 'target', 'progress', 'updated']).optional(),
    q: z.string().max(200).optional(),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    includeArchived: z.enum(['true', 'false']).optional(),
  })
  .strict();
export type GoalListQuery = z.infer<typeof goalListQuerySchema>;

export const createLifeGoalRequestSchema = z
  .object({
    areaId: z.string().min(1).max(64).optional(),
    areaKey: z.string().min(1).max(64).optional(),
    parentGoalId: z.string().max(64).nullable().optional(),
    title: z.string().min(1).max(200),
    description: nullableText.optional(),
    horizon: goalHorizon.optional(),
    status: z.enum(['draft', 'active']).optional(),
    priority: z.number().int().min(1).max(5).optional(),
    startDate: localDate.nullable().optional(),
    targetDate: localDate.nullable().optional(),
    successCriteria: nullableText.optional(),
    progressMode: z.enum(['manual', 'metrics', 'tasks', 'hybrid']).optional(),
    manualProgress: z.number().min(0).max(100).nullable().optional(),
  })
  .strict()
  .refine((value) => value.areaId !== undefined || value.areaKey !== undefined, {
    message: 'Informe areaId ou areaKey.',
  })
  .refine(
    (value) =>
      value.startDate == null || value.targetDate == null || value.targetDate >= value.startDate,
    { path: ['targetDate'], message: 'A data-alvo não pode anteceder o início.' },
  );
export type CreateLifeGoalRequest = z.infer<typeof createLifeGoalRequestSchema>;

export const updateGoalRequestSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: nullableText.optional(),
    horizon: goalHorizon.optional(),
    priority: z.number().int().min(1).max(5).optional(),
    startDate: localDate.nullable().optional(),
    targetDate: localDate.nullable().optional(),
    successCriteria: nullableText.optional(),
    progressMode: z.enum(['manual', 'metrics', 'tasks', 'hybrid']).optional(),
    manualProgress: z.number().min(0).max(100).nullable().optional(),
    parentGoalId: z.string().max(64).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nenhum campo informado.' });
export type UpdateGoalRequest = z.infer<typeof updateGoalRequestSchema>;

export const updateGoalProgressRequestSchema = z
  .object({
    manualProgress: z.number().min(0).max(100),
  })
  .strict();
export type UpdateGoalProgressRequest = z.infer<typeof updateGoalProgressRequestSchema>;

export const createMilestoneRequestSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: nullableText.optional(),
    dueDate: localDate.nullable().optional(),
    status: milestoneStatus.optional(),
  })
  .strict();
export type CreateMilestoneRequest = z.infer<typeof createMilestoneRequestSchema>;

export const updateMilestoneRequestSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: nullableText.optional(),
    dueDate: localDate.nullable().optional(),
    status: milestoneStatus.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nenhum campo informado.' });
export type UpdateMilestoneRequest = z.infer<typeof updateMilestoneRequestSchema>;

export const goalDashboardQuerySchema = z
  .object({
    from: localDate.optional(),
    to: localDate.optional(),
  })
  .strict();

export const goalDashboardResponseSchema = successSchema(
  z.object({
    date: localDate,
    timezone: z.string(),
    summary: z.object({
      active: z.number().int().nonnegative(),
      paused: z.number().int().nonnegative(),
      achieved: z.number().int().nonnegative(),
      cancelled: z.number().int().nonnegative(),
      draft: z.number().int().nonnegative(),
      inProgress: z.number().int().nonnegative(),
      overdue: z.number().int().nonnegative(),
      stale: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }),
    progress: z.object({
      overall: z.number().min(0).max(100).nullable(),
      knownCount: z.number().int().nonnegative(),
      activeCount: z.number().int().nonnegative(),
    }),
    byArea: z.array(
      z.object({
        areaKey: z.string(),
        areaName: z.string(),
        active: z.number().int().nonnegative(),
        achieved: z.number().int().nonnegative(),
        overdue: z.number().int().nonnegative(),
        averageProgress: z.number().min(0).max(100).nullable(),
        knownProgressCount: z.number().int().nonnegative(),
      }),
    ),
    deadlines: z.array(
      lifeGoalDtoSchema.pick({ id: true, title: true, targetDate: true, areaKey: true }),
    ),
    attention: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        areaKey: z.string(),
        score: z.number().int().min(0).max(100),
        level: z.enum(['none', 'low', 'medium', 'high']),
        reasons: z.array(goalAttentionReasonSchema),
      }),
    ),
    milestones: z.array(
      goalMilestoneDtoSchema.pick({
        id: true,
        goalId: true,
        title: true,
        dueDate: true,
        status: true,
      }),
    ),
    studies: z.object({
      linkedGoals: z.number().int().nonnegative(),
      totalMinutes: z.number().nonnegative(),
      sessionCount: z.number().int().nonnegative(),
      goalsWithoutRecentActivity: z.number().int().nonnegative(),
      truncated: z.boolean(),
    }),
    algorithms: z.object({
      goalProgress: z.string(),
      attention: z.string(),
      studyMinutes: z.string(),
    }),
    generatedAt: instant,
    truncated: z.boolean(),
  }),
);
export type GoalDashboardData = z.infer<typeof goalDashboardResponseSchema>['data'];

export const lifeGoalsResponseSchema = successSchema(z.array(lifeGoalDtoSchema));
export const createLifeGoalResponseSchema = successSchema(lifeGoalDtoSchema);
export const createMilestoneResponseSchema = successSchema(goalMilestoneDtoSchema);
