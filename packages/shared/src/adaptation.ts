import { z } from 'zod';
import { planInstant, planLocalDate } from './plan.js';
import { decisionComparisonSchema, decisionPeriodDtoSchema } from './decision.js';
import { performancePeriodsDtoSchema } from './performance.js';

const text = z.string().max(600);
const label = z.string().max(160);
const sources = z.array(z.string().max(80)).max(24);
const limitations = z.array(z.string().max(300)).max(24);
const confidenceSchema = z.enum(['low', 'medium', 'high']);
const severitySchema = z.enum(['info', 'attention', 'risk', 'critical']);
const statusSchema = z.enum(['open', 'accepted', 'rejected', 'deferred']);
const actionSchema = z.enum(['accept', 'reject', 'defer']);

export const adaptationEvidenceDtoSchema = z
  .object({
    source: z.string().max(120),
    label,
    value: text,
    period: decisionPeriodDtoSchema,
    method: text,
    limitations: z.array(z.string().max(300)).max(12),
  })
  .strict();

export const adaptationDeviationDtoSchema = z
  .object({
    id: z.string().max(120),
    kind: z.string().max(80),
    severity: severitySchema,
    area: z.string().max(80),
    title: label,
    summary: text,
    observed: text,
    expected: text,
    gap: text,
    confidence: confidenceSchema,
    confidenceScore: z.number().min(0).max(1),
    period: decisionPeriodDtoSchema,
    evidence: z.array(adaptationEvidenceDtoSchema).max(16),
    sources,
    limitations,
    algorithmVersion: z.string().max(80),
  })
  .strict();

export const adaptationImpactDtoSchema = z
  .object({
    id: z.string().max(120),
    deviationId: z.string().max(120),
    severity: severitySchema,
    affectedGoals: z.array(z.string().max(120)).max(20),
    affectedProjects: z.array(z.string().max(120)).max(20),
    affectedTasks: z.array(z.string().max(120)).max(20),
    timeImpact: text,
    capacityImpact: text,
    riskImpact: text,
    summary: text,
    evidence: z.array(adaptationEvidenceDtoSchema).max(16),
    limitations,
    algorithmVersion: z.string().max(80),
  })
  .strict();

export const adaptationConstraintDtoSchema = z
  .object({
    id: z.string().max(120),
    kind: z.enum(['capacity', 'dependency', 'deadline', 'data', 'conflict']),
    label,
    detail: text,
    blocking: z.boolean(),
  })
  .strict();

export const adaptationAlternativeDtoSchema = z
  .object({
    id: z.string().max(120),
    label,
    description: text,
    tradeoffs: z.array(z.string().max(300)).max(12),
    expectedEffect: text,
    effortMinutes: z.number().int().nonnegative().nullable(),
    risk: severitySchema,
    confidence: confidenceSchema,
    limitations: z.array(z.string().max(300)).max(12),
    algorithmVersion: z.string().max(80),
  })
  .strict();

export const adaptationSimulationDtoSchema = z
  .object({
    id: z.string().max(120),
    alternativeId: z.string().max(120),
    label,
    baseline: text,
    projected: text,
    delta: text,
    assumptions: z.array(z.string().max(300)).max(12),
    limitations: z.array(z.string().max(300)).max(12),
    confidence: confidenceSchema,
    algorithmVersion: z.string().max(80),
  })
  .strict();

export const adaptationProposalDtoSchema = z
  .object({
    id: z.string().max(120),
    status: statusSchema,
    kind: z.string().max(80),
    title: label,
    summary: text,
    reason: text,
    recommendedAction: text,
    severity: severitySchema,
    confidence: confidenceSchema,
    confidenceScore: z.number().min(0).max(1),
    period: decisionPeriodDtoSchema,
    deviationIds: z.array(z.string().max(120)).max(24),
    impactIds: z.array(z.string().max(120)).max(24),
    constraints: z.array(adaptationConstraintDtoSchema).max(24),
    alternatives: z.array(adaptationAlternativeDtoSchema).max(12),
    simulations: z.array(adaptationSimulationDtoSchema).max(12),
    evidence: z.array(adaptationEvidenceDtoSchema).max(24),
    sources,
    limitations,
    cannotConclude: z.array(z.string().max(300)).max(16),
    algorithmVersion: z.string().max(80),
  })
  .strict();

export const adaptationDecisionRecordDtoSchema = z
  .object({
    proposalId: z.string().max(120),
    action: actionSchema,
    note: z.string().max(1000).nullable(),
    decidedAt: planInstant,
    actor: z.string().max(120),
    version: z.number().int().positive(),
  })
  .strict();

export const adaptationOutcomeDtoSchema = z
  .object({
    proposalId: z.string().max(120),
    decisionAction: actionSchema,
    decidedAt: planInstant,
    baselinePeriod: decisionPeriodDtoSchema,
    followUpPeriod: decisionPeriodDtoSchema,
    observedChange: text,
    status: z.enum(['improved', 'unchanged', 'worsened', 'insufficient_data']),
    evidence: z.array(adaptationEvidenceDtoSchema).max(12),
    limitations: z.array(z.string().max(300)).max(12),
    algorithmVersion: z.string().max(80),
  })
  .strict();

export const adaptationDashboardDtoSchema = z
  .object({
    today: planLocalDate,
    periods: performancePeriodsDtoSchema,
    deviations: z.array(adaptationDeviationDtoSchema).max(24),
    impacts: z.array(adaptationImpactDtoSchema).max(24),
    constraints: z.array(adaptationConstraintDtoSchema).max(24),
    proposals: z.array(adaptationProposalDtoSchema).max(12),
    algorithms: z.record(z.string(), z.string().max(80)),
    limitations,
  })
  .strict();

export const adaptationHistoryItemDtoSchema = z
  .object({
    decision: adaptationDecisionRecordDtoSchema,
    proposal: adaptationProposalDtoSchema.nullable(),
    outcome: adaptationOutcomeDtoSchema.nullable(),
  })
  .strict();

export const adaptationDashboardQuerySchema = z
  .object({
    comparison: decisionComparisonSchema.optional(),
    from: planLocalDate.optional(),
    to: planLocalDate.optional(),
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

export const adaptationHistoryQuerySchema = z
  .object({
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();

export const adaptationDecisionRequestSchema = z
  .object({
    proposalId: z.string().max(120),
    action: actionSchema,
    note: z.string().max(1000).nullable().optional(),
    version: z.number().int().positive(),
    comparison: decisionComparisonSchema.optional(),
    from: planLocalDate.optional(),
    to: planLocalDate.optional(),
  })
  .strict();

export const adaptationDashboardResponseSchema = z
  .object({ data: adaptationDashboardDtoSchema })
  .strict();
export const adaptationProposalsResponseSchema = z
  .object({ data: z.array(adaptationProposalDtoSchema).max(12) })
  .strict();
export const adaptationDecisionResponseSchema = z
  .object({ data: adaptationDecisionRecordDtoSchema })
  .strict();
export const adaptationHistoryResponseSchema = z
  .object({
    data: z.array(adaptationHistoryItemDtoSchema),
    meta: z
      .object({
        requestId: z.string(),
        nextCursor: z.string().optional(),
        hasMore: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type AdaptationDashboardDto = z.infer<typeof adaptationDashboardDtoSchema>;
export type AdaptationProposalDto = z.infer<typeof adaptationProposalDtoSchema>;
export type AdaptationDecisionRecordDto = z.infer<typeof adaptationDecisionRecordDtoSchema>;
export type AdaptationOutcomeDto = z.infer<typeof adaptationOutcomeDtoSchema>;
export type AdaptationHistoryItemDto = z.infer<typeof adaptationHistoryItemDtoSchema>;
export type AdaptationDashboardQuery = z.infer<typeof adaptationDashboardQuerySchema>;
export type AdaptationHistoryQuery = z.infer<typeof adaptationHistoryQuerySchema>;
export type AdaptationDecisionRequest = z.infer<typeof adaptationDecisionRequestSchema>;
