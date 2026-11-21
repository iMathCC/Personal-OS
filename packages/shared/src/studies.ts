import { z } from 'zod';
import { successSchema } from './auth';

const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data local inválida.')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), 'Data local inválida.');

const instant = z.iso.datetime({ offset: false });
const timezone = z.string().min(1).max(64);
const nullableText = z.string().max(10_000).nullable();

export const areaDtoSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  version: z.number().int().nonnegative(),
});
export type AreaDto = z.infer<typeof areaDtoSchema>;
export const areasResponseSchema = successSchema(z.array(areaDtoSchema));

export const courseDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  provider: z.string().nullable(),
  status: z.enum(['planned', 'active', 'paused', 'completed', 'dropped']),
  startDate: localDate.nullable(),
  targetEndDate: localDate.nullable(),
  plannedMinutes: z.number().int().nonnegative().nullable(),
  version: z.number().int().positive(),
  createdAt: instant,
});
export type CourseDto = z.infer<typeof courseDtoSchema>;

export const createCourseRequestSchema = z
  .object({
    title: z.string().min(1).max(200),
    provider: z.string().max(200).nullable().optional(),
    status: z.enum(['planned', 'active', 'paused', 'completed', 'dropped']).optional(),
    startDate: localDate.nullable().optional(),
    targetEndDate: localDate.nullable().optional(),
    plannedMinutes: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();
export type CreateCourseRequest = z.infer<typeof createCourseRequestSchema>;
export const createCourseResponseSchema = successSchema(courseDtoSchema);
export const coursesResponseSchema = successSchema(z.array(courseDtoSchema));

export const studySessionDtoSchema = z.object({
  id: z.string(),
  courseId: z.string().nullable(),
  topic: z.string(),
  startedAt: instant,
  localDate,
  timezone,
  durationMinutes: z.number().int().positive(),
  unitsCompleted: z.number().nonnegative().nullable(),
  sourceId: z.string(),
  version: z.number().int().positive(),
  createdAt: instant,
});
export type StudySessionDto = z.infer<typeof studySessionDtoSchema>;

export const createStudySessionRequestSchema = z
  .object({
    courseId: z.string().nullable().optional(),
    topic: z.string().min(1).max(200),
    startedAt: instant,
    timezone,
    durationMinutes: z
      .number()
      .int()
      .positive()
      .max(24 * 60),
    unitsCompleted: z.number().nonnegative().nullable().optional(),
    notes: nullableText.optional(),
  })
  .strict();
export type CreateStudySessionRequest = z.infer<typeof createStudySessionRequestSchema>;
export const createStudySessionResponseSchema = successSchema(studySessionDtoSchema);

export const listSessionsQuerySchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  from: localDate.optional(),
  to: localDate.optional(),
  courseId: z.string().optional(),
});
export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;
export const studySessionsResponseSchema = successSchema(z.array(studySessionDtoSchema));

export const observationDtoSchema = z.object({
  id: z.string(),
  metricId: z.string(),
  observedAt: instant,
  localDate,
  timezone,
  valueNum: z.number().nullable(),
  valueText: z.string().nullable(),
  sampleMarker: z.string().nullable(),
  sourceId: z.string(),
  algorithmVersion: z.string().nullable(),
  supersededBy: z.string().nullable(),
  studySessionId: z.string().nullable(),
  courseId: z.string().nullable(),
  createdOperationId: z.string().nullable(),
});
export type ObservationDto = z.infer<typeof observationDtoSchema>;
export const observationsResponseSchema = successSchema(z.array(observationDtoSchema));

export const supersedeObservationRequestSchema = z
  .object({
    valueNum: z.number().finite(),
    reason: z.string().min(1).max(500).optional(),
  })
  .strict();
export type SupersedeObservationRequest = z.infer<typeof supersedeObservationRequestSchema>;
export const supersedeObservationResponseSchema = successSchema(observationDtoSchema);

export const seriesQuerySchema = z.object({
  from: localDate,
  to: localDate,
  granularity: z.enum(['day', 'week']).optional(),
});
export type SeriesQuery = z.infer<typeof seriesQuerySchema>;

export const seriesPointSchema = z.object({
  date: localDate,
  value: z.number().nullable(),
  sampleCount: z.number().int().nonnegative(),
});
export const seriesResponseSchema = successSchema(
  z.object({
    metricKey: z.string(),
    unit: z.string(),
    granularity: z.enum(['day', 'week']),
    points: z.array(seriesPointSchema),
    algorithmVersion: z.string(),
    timezone: z.string(),
  }),
);

export const dashboardStudiesQuerySchema = z.object({
  from: localDate,
  to: localDate,
});
export const dashboardStudiesResponseSchema = successSchema(
  z.object({
    period: z.object({ from: localDate, to: localDate, timezone }),
    summary: z.object({
      totalMinutes: z.number().nonnegative(),
      sessionCount: z.number().int().nonnegative(),
      daysStudied: z.number().int().nonnegative(),
      averageMinutes: z.number().nullable(),
    }),
    series: z.array(seriesPointSchema),
    generatedAt: instant,
  }),
);

export const sessionDetailResponseSchema = successSchema(
  z.object({
    session: studySessionDtoSchema,
    observations: z.array(observationDtoSchema),
  }),
);

export const softDeleteResponseSchema = successSchema(
  z.object({ id: z.string(), deleted: z.boolean(), version: z.number().int().positive() }),
);
