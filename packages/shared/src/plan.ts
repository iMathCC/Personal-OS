import { z } from 'zod';

/** Primitivas compartilhadas por Projetos, Tarefas e Execução. */
export const planLocalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data local inválida.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Data local inválida.');

export const planInstant = z.iso.datetime({ offset: false });
export const planNullableText = z.string().max(2_000).nullable();

export const planPriority = z.enum(['low', 'medium', 'high', 'critical']);
export type PlanPriority = z.infer<typeof planPriority>;

export const projectStatus = z.enum([
  'planned',
  'active',
  'paused',
  'completed',
  'cancelled',
  'archived',
]);
export type ProjectStatus = z.infer<typeof projectStatus>;

export const taskStatus = z.enum(['todo', 'in_progress', 'blocked', 'completed', 'cancelled']);
export type TaskStatus = z.infer<typeof taskStatus>;

export const planMilestoneStatus = z.enum(['pending', 'in_progress', 'completed', 'cancelled']);
export type PlanMilestoneStatus = z.infer<typeof planMilestoneStatus>;

export const projectProgressSchema = z.object({
  percent: z.number().min(0).max(100).nullable(),
  basis: z.enum(['tasks', 'status', 'none']),
  algorithmVersion: z.string(),
  completedTasks: z.number().int().nonnegative(),
  eligibleTasks: z.number().int().nonnegative(),
  totalTasks: z.number().int().nonnegative(),
});
export type ProjectProgressDto = z.infer<typeof projectProgressSchema>;

export const projectActivitySchema = z.object({
  state: z.enum(['active', 'stalled', 'paused', 'unknown', 'completed']),
  lastActivityAt: planInstant.nullable(),
  daysSinceActivity: z.number().int().nonnegative().nullable(),
  windowDays: z.number().int().positive(),
  algorithmVersion: z.string(),
});
export type PlanProjectActivityDto = z.infer<typeof projectActivitySchema>;
