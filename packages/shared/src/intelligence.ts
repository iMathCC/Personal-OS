import { z } from 'zod';
import { planInstant, planLocalDate } from './plan.js';

/** Contratos da camada de inteligência. Nenhum número é inferido no cliente. */

export const intelligenceAreaSchema = z.enum([
  'studies',
  'goals',
  'projects',
  'tasks',
  'execution',
]);
export const timelineAreaSchema = z.enum([
  'studies',
  'goals',
  'projects',
  'tasks',
  'execution',
  'reviews',
]);
export const timelineEventKindSchema = z.enum([
  'study',
  'task',
  'milestone',
  'project',
  'goal',
  'review',
]);

export const intelligencePeriodSchema = z
  .object({ from: planLocalDate, to: planLocalDate })
  .strict();

export const intelligenceMetricDtoSchema = z
  .object({
    id: z.string().max(120),
    name: z.string().max(160),
    area: intelligenceAreaSchema,
    kind: z.enum(['observed', 'derived', 'estimated', 'unavailable']),
    value: z.number().finite().nullable(),
    unit: z.string().max(24),
    period: intelligencePeriodSchema,
    referenceDate: planLocalDate,
    source: z.string().max(120),
    coverage: z.number().min(0).max(1).nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    algorithmVersion: z.string().max(80),
  })
  .strict();

export const trendDtoSchema = z
  .object({
    id: z.string().max(120),
    label: z.string().max(160),
    area: intelligenceAreaSchema,
    status: z.enum(['ok', 'insufficient_data']),
    reason: z.string().max(240).nullable(),
    direction: z.enum(['up', 'down', 'stable', 'unknown']),
    observedPoints: z.number().int().nonnegative(),
    firstValue: z.number().finite().nullable(),
    lastValue: z.number().finite().nullable(),
    absoluteChange: z.number().finite().nullable(),
    changePercent: z.number().finite().nullable(),
    stable: z.boolean().nullable(),
    window: intelligencePeriodSchema,
    algorithmVersion: z.string().max(80),
  })
  .strict();

export const consistencyDtoSchema = z
  .object({
    area: intelligenceAreaSchema,
    period: intelligencePeriodSchema,
    status: z.enum(['available', 'insufficient_data']),
    observedDays: z.number().int().nonnegative(),
    activeDays: z.number().int().nonnegative(),
    unobservedDays: z.number().int().nonnegative(),
    inactiveDays: z.number().int().nonnegative(),
    recordedFrequency: z.number().min(0).max(1).nullable(),
    coverage: z.number().min(0).max(1),
    note: z.string().max(400),
    algorithmVersion: z.string().max(80),
  })
  .strict();

export const alertEvidenceDtoSchema = z
  .object({ label: z.string().max(120), value: z.string().max(240) })
  .strict();

export const intelligenceAlertDtoSchema = z
  .object({
    code: z.string().max(80),
    category: z.enum(['goal', 'project', 'task', 'study', 'data']),
    severity: z.enum(['low', 'medium', 'high']),
    title: z.string().max(240),
    explanation: z.string().max(800),
    evidence: z.array(alertEvidenceDtoSchema).max(12),
    source: z.string().max(120),
    referenceDate: planLocalDate,
    recommendation: z.string().max(400),
    href: z.string().max(240).nullable(),
    entityId: z.string().uuid().nullable(),
    algorithmVersion: z.string().max(80),
  })
  .strict();

export const recommendationDtoSchema = z
  .object({
    id: z.string().max(180),
    action: z.string().max(240),
    reason: z.string().max(800),
    evidence: z.array(z.string().max(240)).max(12),
    priority: z.enum(['low', 'medium', 'high']),
    area: z.enum(['studies', 'goals', 'projects', 'tasks', 'execution', 'data']),
    entityId: z.string().uuid().nullable(),
    href: z.string().max(240).nullable(),
    confidence: z.number().min(0).max(1),
    score: z.number().int().nonnegative(),
    algorithmVersion: z.string().max(80),
  })
  .strict();

export const projectionDtoSchema = z
  .object({
    id: z.string().max(120),
    label: z.string().max(160),
    area: intelligenceAreaSchema,
    unit: z.string().max(24),
    status: z.enum(['available', 'insufficient_data']),
    reason: z.string().max(240).nullable(),
    method: z.string().max(80),
    window: intelligencePeriodSchema.nullable(),
    horizonDays: z.number().int().min(1).max(365),
    projectedValue: z.number().finite().nullable(),
    dataPoints: z.number().int().nonnegative(),
    limitations: z.array(z.string().max(300)).max(8),
    confidence: z.number().min(0).max(1).nullable(),
    algorithmVersion: z.string().max(80),
  })
  .strict();

export const coverageSourceDtoSchema = z
  .object({
    key: z.string().max(80),
    label: z.string().max(160),
    recordCount: z.number().int().nonnegative(),
    observedDays: z.number().int().nonnegative(),
    expectedDays: z.number().int().nonnegative(),
    coverageRatio: z.number().min(0).max(1),
    period: intelligencePeriodSchema.nullable(),
    missingFields: z.array(z.string().max(80)).max(24),
  })
  .strict();

export const coverageReportDtoSchema = z
  .object({
    sources: z.array(coverageSourceDtoSchema).max(16),
    unconnectedAreas: z.array(z.string().max(80)).max(16),
    formula: z.string().max(400),
    algorithmVersion: z.string().max(80),
  })
  .strict();

export const intelligenceSeriesDtoSchema = z
  .object({
    id: z.string().max(120),
    label: z.string().max(160),
    unit: z.string().max(24),
    points: z
      .array(
        z
          .object({
            date: planLocalDate,
            value: z.number().finite().nullable(),
            sampleCount: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(64),
  })
  .strict();

export const intelligenceQuerySchema = z
  .object({
    weeks: z.coerce.number().int().min(2).max(8).default(4),
  })
  .strict();

export const intelligenceDashboardDtoSchema = z
  .object({
    date: planLocalDate,
    timezone: z.string().max(80),
    generatedAt: planInstant,
    window: intelligencePeriodSchema,
    metrics: z.array(intelligenceMetricDtoSchema).max(40),
    series: z.array(intelligenceSeriesDtoSchema).max(10),
    trends: z.array(trendDtoSchema).max(20),
    consistency: z.array(consistencyDtoSchema).max(10),
    alerts: z.array(intelligenceAlertDtoSchema).max(20),
    recommendations: z.array(recommendationDtoSchema).max(6),
    projections: z.array(projectionDtoSchema).max(10),
    coverage: coverageReportDtoSchema,
    currentState: z.object({
      studyMinutes: z.number().int().nonnegative(),
      studySessions: z.number().int().nonnegative(),
      activeProjects: z.number().int().nonnegative(),
      activeGoals: z.number().int().nonnegative(),
      relevantTasks: z.number().int().nonnegative(),
    }),
    sourcesWithData: z.array(z.string().max(80)).max(10),
    truncated: z.boolean(),
    algorithms: z.object({
      metric: z.string(),
      trend: z.string(),
      consistency: z.string(),
      alert: z.string(),
      recommendation: z.string(),
      projection: z.string(),
      coverage: z.string(),
    }),
  })
  .strict();

export const intelligenceTimelineQuerySchema = z
  .object({
    area: timelineAreaSchema.optional(),
    kind: timelineEventKindSchema.optional(),
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

export const intelligenceTimelineEventDtoSchema = z
  .object({
    id: z.string().uuid(),
    kind: timelineEventKindSchema,
    area: timelineAreaSchema,
    occurredAt: planInstant,
    entityId: z.string().uuid().nullable(),
    title: z.string().max(240),
    detail: z.string().max(240).nullable(),
    status: z.string().max(40).nullable(),
    href: z.string().max(240).nullable(),
  })
  .strict();

export const weeklyReviewQuerySchema = z
  .object({
    weekStart: planLocalDate.optional(),
  })
  .strict();

export const weeklyReviewListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    cursor: z.string().max(512).optional(),
  })
  .strict();

const reflectionText = z.string().max(2_000).nullable();

export const weeklyReflectionsSchema = z
  .object({
    worked: reflectionText.optional(),
    didntWork: reflectionText.optional(),
    learned: reflectionText.optional(),
    change: reflectionText.optional(),
    focus: reflectionText.optional(),
  })
  .strict();

export const createWeeklyReviewRequestSchema = z
  .object({
    weekStart: planLocalDate,
    timezone: z.string().min(1).max(80),
    reflections: weeklyReflectionsSchema.optional(),
  })
  .strict();

export const updateWeeklyReviewRequestSchema = z
  .object({
    reflections: weeklyReflectionsSchema,
    version: z.number().int().min(1).max(1_000_000),
  })
  .strict();

export const reviewSectionItemSchema = z
  .object({
    code: z.string().max(120),
    label: z.string().max(240),
    detail: z.string().max(800),
    href: z.string().max(240).nullable(),
  })
  .strict();

export const weeklyReviewFactsSchema = z
  .object({
    weekStart: planLocalDate,
    weekEnd: planLocalDate,
    studyMinutes: z.number().int().nonnegative(),
    studySessions: z.number().int().nonnegative(),
    studyObservedDays: z.number().int().nonnegative(),
    tasksCompleted: z.number().int().nonnegative(),
    tasksOverdue: z.number().int().nonnegative(),
    activeProjects: z.number().int().nonnegative(),
    movedProjects: z.number().int().nonnegative(),
    goalsUpdated: z.number().int().nonnegative(),
    milestonesCompleted: z.number().int().nonnegative(),
  })
  .strict();

export const weeklyReviewSnapshotDtoSchema = z
  .object({
    schemaVersion: z.literal(1),
    weekStart: planLocalDate,
    weekEnd: planLocalDate,
    timezone: z.string().max(80),
    generatedAt: planInstant,
    periods: z
      .object({ current: intelligencePeriodSchema, previous: intelligencePeriodSchema })
      .strict(),
    sections: z
      .object({
        happened: z.array(reviewSectionItemSchema).max(20),
        advanced: z.array(reviewSectionItemSchema).max(20),
        behind: z.array(reviewSectionItemSchema).max(20),
        attention: z.array(reviewSectionItemSchema).max(20),
        next: z.array(reviewSectionItemSchema).max(20),
      })
      .strict(),
    metrics: z.array(intelligenceMetricDtoSchema).max(40),
    trends: z.array(trendDtoSchema).max(20),
    alerts: z.array(intelligenceAlertDtoSchema).max(20),
    recommendations: z.array(recommendationDtoSchema).max(6),
    coverage: coverageReportDtoSchema,
    limitations: z.array(z.string().max(400)).max(20),
    algorithmVersion: z.string().max(80),
  })
  .strict();

export const weeklyReviewDtoSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int().positive(),
    weekStart: planLocalDate,
    weekEnd: planLocalDate,
    timezone: z.string().max(80),
    status: z.enum(['computed', 'saved', 'updated']),
    snapshot: weeklyReviewSnapshotDtoSchema,
    reflections: weeklyReflectionsSchema,
    createdAt: planInstant,
    updatedAt: planInstant,
  })
  .strict();

export const computedWeeklyReviewDtoSchema = z
  .object({
    status: z.literal('computed'),
    weekStart: planLocalDate,
    weekEnd: planLocalDate,
    timezone: z.string().max(80),
    snapshot: weeklyReviewSnapshotDtoSchema,
    /** Revisão salva anteriormente para a mesma semana; `null` se ainda não houve salvamento. */
    saved: weeklyReviewDtoSchema.nullable(),
  })
  .strict();

export type IntelligenceQuery = z.infer<typeof intelligenceQuerySchema>;
export type IntelligenceSeriesDto = z.infer<typeof intelligenceSeriesDtoSchema>;
export type IntelligenceDashboardData = z.infer<typeof intelligenceDashboardDtoSchema>;
export type TrendDto = z.infer<typeof trendDtoSchema>;
export type ConsistencyDto = z.infer<typeof consistencyDtoSchema>;
export type IntelligenceAlertDto = z.infer<typeof intelligenceAlertDtoSchema>;
export type RecommendationDto = z.infer<typeof recommendationDtoSchema>;
export type ProjectionDto = z.infer<typeof projectionDtoSchema>;
export type CoverageReportDto = z.infer<typeof coverageReportDtoSchema>;
export type IntelligenceMetricDto = z.infer<typeof intelligenceMetricDtoSchema>;
export type IntelligenceTimelineQuery = z.infer<typeof intelligenceTimelineQuerySchema>;
export type IntelligenceTimelineEventDto = z.infer<typeof intelligenceTimelineEventDtoSchema>;
export type WeeklyReviewQuery = z.infer<typeof weeklyReviewQuerySchema>;
export type WeeklyReviewListQuery = z.infer<typeof weeklyReviewListQuerySchema>;
export type WeeklyReflections = z.infer<typeof weeklyReflectionsSchema>;
export type CreateWeeklyReviewRequest = z.infer<typeof createWeeklyReviewRequestSchema>;
export type UpdateWeeklyReviewRequest = z.infer<typeof updateWeeklyReviewRequestSchema>;
export type WeeklyReviewDto = z.infer<typeof weeklyReviewDtoSchema>;
export type WeeklyReviewSnapshotDto = z.infer<typeof weeklyReviewSnapshotDtoSchema>;
export type ReviewSectionItem = z.infer<typeof reviewSectionItemSchema>;
export type ComputedWeeklyReviewDto = z.infer<typeof computedWeeklyReviewDtoSchema>;
