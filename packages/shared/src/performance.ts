import { z } from 'zod';
import { planInstant, planLocalDate } from './plan.js';
import {
  decisionComparisonSchema,
  decisionPeriodDtoSchema,
  decisionPeriodsDtoSchema,
  decisionReviewDtoSchema,
} from './decision.js';
import { consistencyDtoSchema, projectionDtoSchema } from './intelligence.js';

/**
 * Contratos do painel longitudinal de desempenho. Nenhum número é calculado no
 * cliente; o servidor envia somente campos allowlist, com origem, período,
 * método, confiança e limitações explícitas.
 */

const performanceText = z.string().max(600);
const performanceLabel = z.string().max(160);
const performanceSources = z.array(z.string().max(80)).max(24);
const performanceLimitations = z.array(z.string().max(300)).max(20);
const performanceConfidence = z.number().min(0).max(1).nullable();
const performanceUnit = z.string().max(32);

export const performanceDomainIdSchema = z.enum([
  'finance',
  'studies',
  'health',
  'training',
  'reading',
  'time',
  'projects',
  'goals',
  'strategy',
]);
export type PerformanceDomainIdDto = z.infer<typeof performanceDomainIdSchema>;

export const performanceCompletenessSchema = z.enum(['complete', 'incomplete', 'unknown']);

export const performanceQuerySchema = z
  .object({
    comparison: decisionComparisonSchema.optional(),
    from: planLocalDate.optional(),
    to: planLocalDate.optional(),
    reviewKind: z.enum(['monthly', 'quarterly']).default('monthly'),
  })
  .strict()
  .refine((value) => (value.from === undefined) === (value.to === undefined), {
    path: ['from'],
    message: 'Informe from e to juntos.',
  })
  .refine((value) => value.from === undefined || value.to === undefined || value.to >= value.from, {
    path: ['to'],
    message: 'A data final não pode anteceder a inicial.',
  });
export type PerformanceQuery = z.infer<typeof performanceQuerySchema>;

export const performancePeriodsDtoSchema = decisionPeriodsDtoSchema
  .extend({
    currentCompleteness: performanceCompletenessSchema,
    previousCompleteness: performanceCompletenessSchema,
    comparable: z.boolean(),
    limitations: performanceLimitations,
  })
  .strict();
export type PerformancePeriodsDto = z.infer<typeof performancePeriodsDtoSchema>;

export const performanceSeriesPointDtoSchema = z
  .object({
    date: planLocalDate,
    /** `null` permanece lacuna no gráfico; nunca é convertido em zero. */
    value: z.number().finite().nullable(),
    sampleCount: z.number().int().nonnegative().optional(),
  })
  .strict();
export type PerformanceSeriesPointDto = z.infer<typeof performanceSeriesPointDtoSchema>;

export const performanceDomainDtoSchema = z
  .object({
    id: performanceDomainIdSchema,
    label: performanceLabel,
    unit: performanceUnit,
    source: z.string().max(80),
    available: z.boolean(),
    recordCount: z.number().int().nonnegative(),
  })
  .strict();
export type PerformanceDomainDto = z.infer<typeof performanceDomainDtoSchema>;

export const performanceIndicatorDtoSchema = z
  .object({
    id: z.string().max(120),
    label: performanceLabel,
    domain: performanceDomainIdSchema,
    unit: performanceUnit,
    source: z.string().max(80),
    status: z.enum(['observed', 'calculated', 'unavailable']),
    currentValue: z.number().finite().nullable(),
    previousValue: z.number().finite().nullable(),
    delta: z.number().finite().nullable(),
    changePercent: z.number().finite().nullable(),
    direction: z.enum(['up', 'down', 'stable', 'unknown']),
    observedPoints: z.number().int().nonnegative(),
    points: z.array(performanceSeriesPointDtoSchema).max(200),
    coverage: z.number().min(0).max(1).nullable(),
    confidence: performanceConfidence,
    period: decisionPeriodDtoSchema,
    previousPeriod: decisionPeriodDtoSchema,
    evidence: z
      .object({
        source: z.string().max(80),
        period: decisionPeriodDtoSchema,
        method: performanceText,
        limitations: performanceLimitations,
      })
      .strict(),
    limitations: performanceLimitations,
    algorithmVersion: z.string().max(80),
  })
  .strict();
export type PerformanceIndicatorDto = z.infer<typeof performanceIndicatorDtoSchema>;

export const performancePatternDtoSchema = z
  .object({
    id: z.string().max(120),
    label: performanceLabel,
    domain: performanceDomainIdSchema,
    source: z.string().max(80),
    window: decisionPeriodDtoSchema,
    status: z.enum(['identified', 'hypothesis', 'inconclusive']),
    classification: z.enum(['pattern', 'hypothesis', 'inconclusive']),
    shape: z.enum(['decline', 'improvement', 'oscillation', 'stable', 'unknown']),
    observations: z.number().int().nonnegative(),
    recurrentSteps: z.number().int().nonnegative(),
    confidence: performanceConfidence,
    evidence: performanceText,
    causality: z.literal('not_claimed'),
    limitations: performanceLimitations,
    algorithmVersion: z.string().max(80),
  })
  .strict();
export type PerformancePatternDto = z.infer<typeof performancePatternDtoSchema>;

export const performanceAssociationDtoSchema = z
  .object({
    id: z.string().max(120),
    label: performanceLabel,
    status: z.enum(['ok', 'insufficient_data', 'incompatible']),
    relation: z.enum(['positive', 'negative', 'none', 'not_estimated']),
    correlation: z.number().min(-1).max(1).nullable(),
    observations: z.number().int().nonnegative(),
    pairedPoints: z.number().int().nonnegative(),
    coverage: z.number().min(0).max(1).nullable(),
    confidence: z.number().min(0).max(1),
    causality: z.literal('not_claimed'),
    descriptive: performanceText,
    limitations: performanceLimitations,
    algorithmVersion: z.string().max(80),
  })
  .strict();
export type PerformanceAssociationDto = z.infer<typeof performanceAssociationDtoSchema>;

export const performanceProjectionDtoSchema = projectionDtoSchema
  .extend({
    domain: performanceDomainIdSchema,
    source: z.string().max(80),
    classification: z.literal('simulation'),
    assumptions: z.array(z.string().max(300)).max(8),
    limitations: z.array(z.string().max(300)).max(12),
  })
  .strict();
export type PerformanceProjectionDto = z.infer<typeof performanceProjectionDtoSchema>;

export const performanceExecutionDtoSchema = z
  .object({
    period: decisionPeriodDtoSchema,
    completionRate: z.number().min(0).max(1).nullable(),
    plannedTasks: z.number().int().nonnegative(),
    completedTasks: z.number().int().nonnegative(),
    overdueTasks: z.number().int().nonnegative(),
    blockedTasks: z.number().int().nonnegative(),
    estimatedMinutes: z.number().finite().nullable(),
    unestimatedCount: z.number().int().nonnegative(),
    measuredMinutes: z.number().finite().nullable(),
    declaredCapacityMinutes: z.number().finite().nullable(),
    capacityGapMinutes: z.number().finite().nullable(),
    consistency: consistencyDtoSchema,
    source: z.string().max(80),
    limitations: performanceLimitations,
    algorithmVersion: z.string().max(80),
  })
  .strict();
export type PerformanceExecutionDto = z.infer<typeof performanceExecutionDtoSchema>;

export const performanceGoalEvolutionDtoSchema = z
  .object({
    period: decisionPeriodDtoSchema,
    advanced: z.number().int().nonnegative(),
    stagnant: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    activeCycles: z.number().int().nonnegative(),
    linkedEntities: z.number().int().nonnegative(),
    limitations: performanceLimitations,
    algorithmVersion: z.string().max(80),
  })
  .strict();
export type PerformanceGoalEvolutionDto = z.infer<typeof performanceGoalEvolutionDtoSchema>;

export const performanceSnapshotItemDtoSchema = z
  .object({
    label: performanceText,
    value: performanceText,
    kind: z.enum(['observed', 'calculated', 'insufficient', 'simulation']),
    sources: performanceSources,
  })
  .strict();
export type PerformanceSnapshotItemDto = z.infer<typeof performanceSnapshotItemDtoSchema>;

export const performanceSnapshotDtoSchema = z
  .object({
    id: z.string().max(120),
    immutable: z.literal(true),
    kind: z.enum(['monthly', 'quarterly']),
    createdAt: planInstant,
    period: decisionPeriodDtoSchema,
    previous: decisionPeriodDtoSchema,
    sections: z
      .array(
        z
          .object({
            title: performanceLabel,
            items: z.array(performanceSnapshotItemDtoSchema).max(24),
          })
          .strict(),
      )
      .max(10),
    limitations: performanceLimitations,
    persistedSnapshot: z.boolean(),
    algorithmVersion: z.string().max(80),
  })
  .strict();
export type PerformanceSnapshotDto = z.infer<typeof performanceSnapshotDtoSchema>;

export const performanceDashboardDtoSchema = z
  .object({
    date: planLocalDate,
    timezone: z.string().max(80),
    generatedAt: planInstant,
    periods: performancePeriodsDtoSchema,
    domains: z.array(performanceDomainDtoSchema).max(16),
    indicators: z.array(performanceIndicatorDtoSchema).max(24),
    patterns: z.array(performancePatternDtoSchema).max(16),
    associations: z.array(performanceAssociationDtoSchema).max(12),
    projections: z.array(performanceProjectionDtoSchema).max(10),
    execution: z.array(performanceExecutionDtoSchema).max(4),
    goals: performanceGoalEvolutionDtoSchema.nullable(),
    review: decisionReviewDtoSchema.nullable(),
    snapshot: performanceSnapshotDtoSchema.nullable(),
    limitations: performanceLimitations,
    truncated: z.boolean(),
    algorithms: z.record(z.string(), z.string().max(80)),
  })
  .strict();
export type PerformanceDashboardDto = z.infer<typeof performanceDashboardDtoSchema>;

export const performanceDashboardResponseSchema = z
  .object({ data: performanceDashboardDtoSchema })
  .strict();
