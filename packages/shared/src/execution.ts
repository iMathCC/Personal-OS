import { z } from 'zod';
import { planInstant, planLocalDate, planPriority, projectStatus, taskStatus } from './plan.js';

export const executionQuerySchema = z
  .object({
    date: planLocalDate.optional(),
    projectId: z.string().uuid().optional(),
  })
  .strict();

export const nextActionDtoSchema = z
  .object({
    taskId: z.string().uuid(),
    taskTitle: z.string(),
    taskStatus: taskStatus,
    projectId: z.string().uuid().nullable(),
    projectTitle: z.string().nullable(),
    dueDate: planLocalDate.nullable(),
    priority: planPriority,
    score: z.number().int().min(0).max(1_000),
    reasonCodes: z.array(
      z.enum([
        'OVERDUE',
        'DUE_TODAY',
        'DUE_SOON',
        'HIGH_PRIORITY',
        'UNBLOCKED',
        'STALLED_PROJECT',
        'NO_DEADLINE',
      ]),
    ),
    explanation: z.string(),
    algorithmVersion: z.string(),
  })
  .strict();

export const executionRiskDtoSchema = z
  .object({
    kind: z.enum([
      'OVERDUE_TASK',
      'BLOCKED_TASK',
      'STALLED_PROJECT',
      'OVERDUE_MILESTONE',
      'OVERDUE_PROJECT',
    ]),
    entityId: z.string().uuid(),
    title: z.string(),
    severity: z.enum(['low', 'medium', 'high']),
    dueDate: planLocalDate.nullable(),
    reasons: z.array(z.string()),
    algorithmVersion: z.string(),
  })
  .strict();

export const executionSignalsDtoSchema = z
  .object({
    activeProjects: z.number().int().nonnegative(),
    stalledProjects: z.number().int().nonnegative(),
    overdueTasks: z.number().int().nonnegative(),
    blockedTasks: z.number().int().nonnegative(),
    executableTasks: z.number().int().nonnegative(),
    completedTasksToday: z.number().int().nonnegative(),
    dueToday: z.number().int().nonnegative(),
    overdueMilestones: z.number().int().nonnegative(),
    projectsWithoutTasks: z.number().int().nonnegative(),
  })
  .strict();

export const executionDashboardDtoSchema = z
  .object({
    date: planLocalDate,
    timezone: z.string(),
    generatedAt: planInstant,
    signals: executionSignalsDtoSchema,
    nextAction: nextActionDtoSchema.nullable(),
    risks: z.array(executionRiskDtoSchema),
    projects: z.array(
      z.object({
        id: z.string().uuid(),
        title: z.string(),
        status: projectStatus,
        progress: z.object({
          percent: z.number().min(0).max(100).nullable(),
          basis: z.enum(['tasks', 'status', 'none']),
        }),
        activityState: z.enum(['active', 'stalled', 'paused', 'unknown', 'completed']),
        daysSinceActivity: z.number().int().nonnegative().nullable(),
      }),
    ),
    algorithms: z.object({
      progress: z.string(),
      activity: z.string(),
      blocking: z.string(),
      nextAction: z.string(),
      risk: z.string(),
    }),
    truncated: z.boolean(),
  })
  .strict();

export const timelineQuerySchema = z
  .object({
    projectId: z.string().uuid().optional(),
    from: planLocalDate.optional(),
    to: planLocalDate.optional(),
    cursor: z
      .string()
      .max(64)
      .refine((value) => /^event:[0-9a-f-]{36}$/.test(value), {
        message: 'Cursor de linha do tempo inválido',
      })
      .optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

export const timelineEventDtoSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(['project', 'task', 'milestone', 'completion']),
    occurredAt: planInstant,
    projectId: z.string().uuid().nullable(),
    entityId: z.string().uuid(),
    title: z.string(),
    detail: z.string().nullable(),
    status: z.string().nullable(),
  })
  .strict();

export type ExecutionQuery = z.infer<typeof executionQuerySchema>;
export type ExecutionDashboardData = z.infer<typeof executionDashboardDtoSchema>;
export type NextActionDto = z.infer<typeof nextActionDtoSchema>;
export type ExecutionRiskDto = z.infer<typeof executionRiskDtoSchema>;
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;
export type TimelineEventDto = z.infer<typeof timelineEventDtoSchema>;
