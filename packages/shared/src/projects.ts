import { z } from 'zod';
import {
  planInstant,
  planLocalDate,
  planMilestoneStatus,
  planPriority,
  projectProgressSchema,
  projectStatus,
} from './plan.js';

export const projectCursorSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      /^(planned|active|paused|completed|cancelled|archived):[0-9a-f-]{36}:[0-9a-f-]{36}$/.test(
        value,
      ),
    { message: 'Cursor de projeto inválido' },
  );

export const listProjectsQuerySchema = z
  .object({
    status: projectStatus.optional(),
    priority: planPriority.optional(),
    goalId: z.string().uuid().optional(),
    search: z.string().trim().min(1).max(120).optional(),
    cursor: projectCursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

export const createProjectBodySchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().max(2_000).nullable().optional(),
    status: projectStatus.default('planned'),
    priority: planPriority.default('medium'),
    startDate: planLocalDate.optional(),
    targetDate: planLocalDate.optional(),
    goalIds: z.array(z.string().uuid()).max(50).default([]),
    milestones: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(180),
            dueDate: planLocalDate.optional(),
            status: planMilestoneStatus.default('pending'),
            position: z.number().int().min(0).max(10_000).default(0),
          })
          .strict(),
      )
      .max(100)
      .default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.startDate && value.targetDate && value.targetDate < value.startDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['targetDate'],
        message: 'targetDate não pode ser anterior a startDate',
      });
    }
  });

export const updateProjectBodySchema = z
  .object({
    title: z.string().trim().min(1).max(180).optional(),
    description: z.string().trim().max(2_000).nullable().optional(),
    status: projectStatus.optional(),
    priority: planPriority.optional(),
    startDate: planLocalDate.nullable().optional(),
    targetDate: planLocalDate.nullable().optional(),
    version: z.number().int().min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.startDate && value.targetDate && value.targetDate < value.startDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['targetDate'],
        message: 'targetDate não pode ser anterior a startDate',
      });
    }
  });

export const setProjectGoalsBodySchema = z
  .object({
    goalIds: z.array(z.string().uuid()).max(50),
    version: z.number().int().min(1),
  })
  .strict();

export const createProjectMilestoneBodySchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    dueDate: planLocalDate.optional(),
    status: planMilestoneStatus.default('pending'),
    position: z.number().int().min(0).max(10_000).default(0),
    version: z.number().int().min(1),
  })
  .strict();

export const updateProjectMilestoneBodySchema = z
  .object({
    title: z.string().trim().min(1).max(180).optional(),
    dueDate: planLocalDate.nullable().optional(),
    status: planMilestoneStatus.optional(),
    position: z.number().int().min(0).max(10_000).optional(),
    version: z.number().int().min(1),
  })
  .strict();

export const projectSummaryDtoSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    description: z.string().nullable(),
    status: projectStatus,
    priority: planPriority,
    startDate: planLocalDate.nullable(),
    targetDate: planLocalDate.nullable(),
    completedAt: planInstant.nullable(),
    version: z.number().int().min(1),
    createdAt: planInstant,
    updatedAt: planInstant,
    progress: projectProgressSchema,
    goalIds: z.array(z.string().uuid()),
  })
  .strict();

export const projectMilestoneDtoSchema = z
  .object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    title: z.string(),
    dueDate: planLocalDate.nullable(),
    status: planMilestoneStatus,
    position: z.number().int().min(0),
    completedAt: planInstant.nullable(),
    version: z.number().int().min(1),
    createdAt: planInstant,
    updatedAt: planInstant,
  })
  .strict();

export const projectDetailDtoSchema = projectSummaryDtoSchema.extend({
  milestones: z.array(projectMilestoneDtoSchema),
  milestoneProgress: projectProgressSchema,
});

export const projectListItemDtoSchema = projectSummaryDtoSchema;

export const projectActivityDtoSchema = z
  .object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    kind: z.string(),
    summary: z.string(),
    detail: z.record(z.string(), z.unknown()).nullable(),
    occurredAt: planInstant,
  })
  .strict();

export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
export type CreateProjectBody = z.infer<typeof createProjectBodySchema>;
export type UpdateProjectBody = z.infer<typeof updateProjectBodySchema>;
export type SetProjectGoalsBody = z.infer<typeof setProjectGoalsBodySchema>;
export type CreateProjectMilestoneBody = z.infer<typeof createProjectMilestoneBodySchema>;
export type UpdateProjectMilestoneBody = z.infer<typeof updateProjectMilestoneBodySchema>;
export type ProjectSummaryDto = z.infer<typeof projectSummaryDtoSchema>;
export type ProjectDetailDto = z.infer<typeof projectDetailDtoSchema>;
export type ProjectMilestoneDto = z.infer<typeof projectMilestoneDtoSchema>;
export type ProjectActivityDto = z.infer<typeof projectActivityDtoSchema>;
