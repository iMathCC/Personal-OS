import { z } from 'zod';
import { successSchema } from './auth';

/** Valida data de calendário real; `2026-02-30` não é aceita. */
const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data local inválida.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Data local inválida.');

const instant = z.iso.datetime({ offset: false });
const timezone = z.string().min(1).max(64);
const nullableText = z.string().max(10_000).nullable();

/** Prefixo da linha do tempo; o CHECK `events_title_length` limita o título a 200 pontos de código. */
export const STUDY_EVENT_TITLE_PREFIX = 'Estudo: ';
export const EVENT_TITLE_MAX_LENGTH = 200;
/** Maior tópico que cabe em `Estudo: ${topic}` sem estourar o título do evento. */
export const STUDY_TOPIC_MAX_LENGTH = EVENT_TITLE_MAX_LENGTH - STUDY_EVENT_TITLE_PREFIX.length;

/**
 * Compõe o título do evento sem truncar. O limite é validado antes da gravação,
 * porque o CHECK do banco usa `length()` (pontos de código), não bytes UTF-16.
 */
export function studyEventTitle(topic: string): string {
  const title = `${STUDY_EVENT_TITLE_PREFIX}${topic}`;
  if (Array.from(title).length > EVENT_TITLE_MAX_LENGTH) {
    throw new RangeError(`Título do evento excede ${EVENT_TITLE_MAX_LENGTH} caracteres.`);
  }
  return title;
}

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
    topic: z
      .string()
      .min(1)
      .max(STUDY_TOPIC_MAX_LENGTH, `Use no máximo ${STUDY_TOPIC_MAX_LENGTH} caracteres no tópico.`),
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

export const listSessionsQuerySchema = z
  .object({
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    from: localDate.optional(),
    to: localDate.optional(),
    courseId: z.string().max(200).optional(),
  })
  .strict();
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

export const seriesQuerySchema = z
  .object({
    from: localDate,
    to: localDate,
    granularity: z.enum(['day', 'week']).optional(),
    courseId: z.string().max(200).optional(),
  })
  .strict();
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
    /** `true` quando a consulta atingiu o teto e havia mais observações. */
    truncated: z.boolean(),
  }),
);

export const goalProgressSchema = z.object({
  percent: z.number().min(0).max(100).nullable(),
  basis: z.enum(['manual', 'metrics', 'status', 'unavailable']),
  algorithmVersion: z.string().nullable(),
  achieved: z.boolean(),
  /** Progresso pode estar incompleto se as observações foram cortadas. */
  truncated: z.boolean(),
});
export type GoalProgressDto = z.infer<typeof goalProgressSchema>;

export const goalDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  horizon: z.enum(['short', 'medium', 'long']),
  status: z.enum(['draft', 'active', 'paused', 'achieved', 'cancelled']),
  priority: z.number().int().min(1).max(5),
  startDate: localDate.nullable(),
  targetDate: localDate.nullable(),
  targetMinutes: z.number().int().positive(),
  progress: goalProgressSchema,
  progressSeries: z.array(seriesPointSchema),
  sourceId: z.string(),
  version: z.number().int().positive(),
  createdAt: instant,
});
export type GoalDto = z.infer<typeof goalDtoSchema>;

export const createGoalRequestSchema = z
  .object({
    title: z.string().min(1).max(200),
    horizon: z.enum(['short', 'medium', 'long']).default('medium'),
    status: z.enum(['draft', 'active']).default('active'),
    priority: z.number().int().min(1).max(5).default(3),
    startDate: localDate,
    targetDate: localDate,
    targetMinutes: z.number().int().positive().max(1_000_000),
  })
  .strict()
  .refine(
    (value) =>
      value.startDate == null || value.targetDate == null || value.targetDate >= value.startDate,
    { path: ['targetDate'], message: 'A data-alvo não pode anteceder o início.' },
  );
export type CreateGoalRequest = z.infer<typeof createGoalRequestSchema>;
export const goalsResponseSchema = successSchema(z.array(goalDtoSchema));
export const createGoalResponseSchema = successSchema(goalDtoSchema);

export const courseMinutesSchema = z.object({
  courseId: z.string().nullable(),
  title: z.string().nullable(),
  minutes: z.number().nonnegative(),
  sessionCount: z.number().int().nonnegative(),
});

export const periodDeltaSchema = z.object({
  current: z.number(),
  previous: z.number(),
  difference: z.number(),
  changePercent: z.number().nullable(),
});
export type PeriodDelta = z.infer<typeof periodDeltaSchema>;

/** Metas são por área, não por curso: este filtro não existe na listagem. */
export const goalsQuerySchema = z
  .object({
    from: localDate,
    to: localDate,
  })
  .strict();

export const dashboardStudiesQuerySchema = z
  .object({
    from: localDate,
    to: localDate,
    courseId: z.string().max(200).optional(),
  })
  .strict();
export const dashboardStudiesResponseSchema = successSchema(
  z.object({
    period: z.object({
      from: localDate,
      to: localDate,
      previousFrom: localDate,
      previousTo: localDate,
      timezone,
    }),
    summary: z.object({
      totalMinutes: z.number().nonnegative(),
      sessionCount: z.number().int().nonnegative(),
      daysStudied: z.number().int().nonnegative(),
      averageMinutes: z.number().nullable(),
    }),
    series: z.array(seriesPointSchema),
    byCourse: z.array(courseMinutesSchema),
    comparison: z.object({
      totalMinutes: periodDeltaSchema,
      sessionCount: periodDeltaSchema,
      daysStudied: periodDeltaSchema,
    }),
    goals: z.array(goalDtoSchema),
    algorithms: z.object({
      studyMinutes: z.string(),
      goalProgress: z.string(),
    }),
    generatedAt: instant,
    /** `true` se qualquer consulta do painel atingiu o teto de observações. */
    truncated: z.boolean(),
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

export type StudiesSeriesData = z.infer<typeof seriesResponseSchema>['data'];
export type StudiesDashboardData = z.infer<typeof dashboardStudiesResponseSchema>['data'];
