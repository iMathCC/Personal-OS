import { z } from 'zod';
import {
  planInstant,
  planLocalDate,
  planPriority,
  projectProgressSchema,
  taskStatus,
} from './plan.js';

export const taskCursorSchema = z
  .string()
  .max(64)
  .refine((value) => /^task:[0-9a-f-]{36}$/.test(value), { message: 'Cursor de tarefa inválido' });

export const listTasksQuerySchema = z
  .object({
    projectId: z.string().uuid().optional(),
    goalId: z.string().uuid().optional(),
    milestoneId: z.string().uuid().optional(),
    status: taskStatus.optional(),
    priority: planPriority.optional(),
    search: z.string().trim().min(1).max(120).optional(),
    dueBefore: planLocalDate.optional(),
    dueAfter: planLocalDate.optional(),
    cursor: taskCursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

export const createTaskBodySchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().max(2_000).nullable().optional(),
    projectId: z.string().uuid().nullable().optional(),
    milestoneId: z.string().uuid().nullable().optional(),
    goalId: z.string().uuid().nullable().optional(),
    status: taskStatus.default('todo'),
    priority: planPriority.default('medium'),
    dueDate: planLocalDate.optional(),
    estimateMinutes: z.number().int().min(0).max(100_000).optional(),
    dependencyIds: z.array(z.string().uuid()).max(100).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.milestoneId && !value.projectId) {
      ctx.addIssue({ code: 'custom', path: ['projectId'], message: 'Marco exige um projeto' });
    }
    if (value.dependencyIds.length !== new Set(value.dependencyIds).size) {
      ctx.addIssue({ code: 'custom', path: ['dependencyIds'], message: 'Dependências duplicadas' });
    }
  });

export const updateTaskBodySchema = z
  .object({
    title: z.string().trim().min(1).max(180).optional(),
    description: z.string().trim().max(2_000).nullable().optional(),
    projectId: z.string().uuid().nullable().optional(),
    milestoneId: z.string().uuid().nullable().optional(),
    goalId: z.string().uuid().nullable().optional(),
    status: taskStatus.optional(),
    priority: planPriority.optional(),
    dueDate: planLocalDate.nullable().optional(),
    estimateMinutes: z.number().int().min(0).max(100_000).nullable().optional(),
    version: z.number().int().min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.milestoneId && value.projectId === null) {
      ctx.addIssue({ code: 'custom', path: ['projectId'], message: 'Marco exige um projeto' });
    }
  });

export const completeTaskBodySchema = z
  .object({
    version: z.number().int().min(1),
  })
  .strict();

export const setTaskDependenciesBodySchema = z
  .object({
    dependencyIds: z.array(z.string().uuid()).max(100),
    version: z.number().int().min(1),
  })
  .strict()
  .refine((value) => value.dependencyIds.length === new Set(value.dependencyIds).size, {
    path: ['dependencyIds'],
    message: 'Dependências duplicadas',
  });

export const taskDependencyDtoSchema = z
  .object({
    id: z.string().uuid(),
    taskId: z.string().uuid(),
    dependsOnTaskId: z.string().uuid(),
    dependsOnTitle: z.string(),
    dependsOnStatus: taskStatus,
    createdAt: planInstant,
  })
  .strict();

export const taskDtoSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    description: z.string().nullable(),
    projectId: z.string().uuid().nullable(),
    projectTitle: z.string().nullable(),
    milestoneId: z.string().uuid().nullable(),
    milestoneTitle: z.string().nullable(),
    goalId: z.string().uuid().nullable(),
    status: taskStatus,
    priority: planPriority,
    dueDate: planLocalDate.nullable(),
    estimateMinutes: z.number().int().nonnegative().nullable(),
    completedAt: planInstant.nullable(),
    version: z.number().int().min(1),
    createdAt: planInstant,
    updatedAt: planInstant,
    overdue: z.boolean(),
    dependencyState: z.enum(['none', 'ready', 'blocked']),
    blockerIds: z.array(z.string().uuid()),
    executable: z.boolean(),
    reason: z.string(),
  })
  .strict();

export const taskDetailDtoSchema = taskDtoSchema.extend({
  dependencies: z.array(taskDependencyDtoSchema),
  dependents: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      status: taskStatus,
    }),
  ),
});

export const taskProgressSchema = projectProgressSchema;

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
export type CreateTaskBody = z.infer<typeof createTaskBodySchema>;
export type UpdateTaskBody = z.infer<typeof updateTaskBodySchema>;
export type CompleteTaskBody = z.infer<typeof completeTaskBodySchema>;
export type SetTaskDependenciesBody = z.infer<typeof setTaskDependenciesBodySchema>;
export type TaskDto = z.infer<typeof taskDtoSchema>;
export type TaskDetailDto = z.infer<typeof taskDetailDtoSchema>;
export type TaskDependencyDto = z.infer<typeof taskDependencyDtoSchema>;
