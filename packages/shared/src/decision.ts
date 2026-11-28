import { z } from 'zod';
import { planInstant, planLocalDate } from './plan.js';

/**
 * Contratos da camada de decisão. Nenhum número é inferido no cliente e nenhum
 * texto sensível (notas, reflexões, valores de saúde) trafega nestes DTOs.
 */

const decisionText = z.string().max(600);
const decisionLabel = z.string().max(160);
const decisionSources = z.array(z.string().max(80)).max(24);
const decisionLimitations = z.array(z.string().max(300)).max(16);
const decisionConfidence = z.number().min(0).max(1);
const decisionCents = z.number().int().nonnegative();

export const decisionSeveritySchema = z.enum(['info', 'attention', 'risk', 'critical']);
export const decisionComparisonSchema = z.enum(['week', 'month', 'quarter', 'custom']);
export const decisionAlertStateSchema = z.enum(['open', 'acknowledged', 'dismissed']);
export const decisionAlertActionSchema = z.enum(['acknowledged', 'dismissed']);
export const decisionReviewKindSchema = z.enum(['weekly', 'monthly', 'quarterly']);
export const decisionAnalysisStatusSchema = z.enum(['ok', 'insufficient_data', 'incompatible']);

export const decisionPeriodDtoSchema = z
  .object({
    from: planLocalDate,
    to: planLocalDate,
  })
  .strict();
export type DecisionPeriodDto = z.infer<typeof decisionPeriodDtoSchema>;

export const decisionPeriodsDtoSchema = z
  .object({
    comparison: decisionComparisonSchema,
    label: decisionLabel,
    current: decisionPeriodDtoSchema,
    previous: decisionPeriodDtoSchema,
    currentDays: z.number().int().positive(),
    previousDays: z.number().int().positive(),
    equivalent: z.boolean(),
    algorithmVersion: z.string().max(80),
  })
  .strict();

export const decisionExplanationDtoSchema = z
  .object({
    identified: decisionText,
    dataUsed: decisionSources,
    calculation: decisionText,
    missing: decisionSources,
    period: decisionPeriodDtoSchema,
    algorithmVersion: z.string().max(80),
    confidence: decisionConfidence,
    cannotConclude: decisionText,
    limitations: decisionLimitations,
    sources: decisionSources,
  })
  .strict();
export type DecisionExplanationDto = z.infer<typeof decisionExplanationDtoSchema>;

export const decisionSufficiencyDtoSchema = z
  .object({
    status: z.enum(['sufficient', 'partial', 'insufficient']),
    observations: z.number().int().nonnegative(),
    observedDays: z.number().int().nonnegative(),
    expectedDays: z.number().int().nonnegative(),
    requiredObservations: z.number().int().positive(),
    coverage: z.number().min(0).max(1).nullable(),
    confidence: decisionConfidence,
    missing: decisionSources,
    limitations: decisionLimitations,
    sources: decisionSources,
    algorithmVersion: z.string().max(80),
  })
  .strict();
export type DecisionSufficiencyDto = z.infer<typeof decisionSufficiencyDtoSchema>;

export const decisionCatalogItemDtoSchema = z
  .object({
    id: z.string().max(120),
    label: decisionLabel,
    sources: decisionSources,
    minimumObservations: z.number().int().positive(),
    correlationAllowed: z.boolean(),
    condition: decisionText,
  })
  .strict();

export const decisionSeriesPointDtoSchema = z
  .object({
    date: planLocalDate,
    value: z.number().finite().nullable(),
  })
  .strict();

export const decisionCrossDomainDtoSchema = z
  .object({
    id: z.string().max(120),
    label: decisionLabel,
    status: decisionAnalysisStatusSchema,
    sources: decisionSources,
    period: decisionPeriodDtoSchema,
    observations: z.number().int().nonnegative(),
    pairedPoints: z.number().int().nonnegative(),
    coverage: z.number().min(0).max(1).nullable(),
    correlation: z.number().min(-1).max(1).nullable(),
    relation: z.enum(['positive', 'negative', 'none', 'not_estimated']),
    descriptive: decisionText,
    confidence: decisionConfidence,
    causality: z.literal('not_claimed'),
    explanation: decisionExplanationDtoSchema,
    algorithmVersion: z.string().max(80),
  })
  .strict();
export type DecisionCrossDomainDto = z.infer<typeof decisionCrossDomainDtoSchema>;

export const decisionAlertDtoSchema = z
  .object({
    id: z.string().max(120),
    type: z.string().max(80),
    severity: decisionSeveritySchema,
    area: z.string().max(80),
    title: decisionLabel,
    reason: decisionText,
    detectedAt: planInstant,
    state: decisionAlertStateSchema,
    stateVersion: z.number().int().positive().nullable(),
    ruleVersion: z.string().max(80),
    entityId: z.string().max(120).nullable(),
    declaredPriority: z.number().int().min(1).max(5).nullable(),
    sources: decisionSources,
    evidence: z.array(z.object({ label: decisionLabel, value: decisionText }).strict()).max(12),
    explanation: decisionExplanationDtoSchema,
    href: z.string().max(240).nullable(),
  })
  .strict();
export type DecisionAlertDto = z.infer<typeof decisionAlertDtoSchema>;

export const decisionRecommendationDtoSchema = z
  .object({
    id: z.string().max(120),
    alertId: z.string().max(120),
    title: decisionLabel,
    description: decisionText,
    reason: decisionText,
    expectedImpact: decisionText,
    urgency: z.enum(['now', 'soon', 'later']),
    effortMinutes: z.number().int().nonnegative().nullable(),
    sources: decisionSources,
    confidence: decisionConfidence,
    score: z.number().int().nonnegative(),
    declaredPriority: z.number().int().min(1).max(5).nullable(),
    suggestedPriority: z.number().int().min(1).max(5),
    limitations: decisionLimitations,
    nextAction: decisionText,
    explanation: decisionExplanationDtoSchema,
    algorithmVersion: z.string().max(80),
  })
  .strict();
export type DecisionRecommendationDto = z.infer<typeof decisionRecommendationDtoSchema>;

export const decisionNextActionDtoSchema = z
  .object({
    id: z.string().max(120),
    kind: z.enum(['task', 'data_collection']),
    title: decisionLabel,
    why: decisionText,
    goalId: z.string().max(120).nullable(),
    projectId: z.string().max(120).nullable(),
    expectedImpact: decisionText,
    effortMinutes: z.number().int().nonnegative().nullable(),
    blockers: decisionLimitations,
    sources: decisionSources,
    confidence: decisionConfidence,
    explanation: decisionExplanationDtoSchema,
    algorithmVersion: z.string().max(80),
  })
  .strict();
export type DecisionNextActionDto = z.infer<typeof decisionNextActionDtoSchema>;

export const decisionAreaIndicatorDtoSchema = z
  .object({
    area: z.string().max(80),
    label: decisionLabel,
    status: z.enum(['available', 'insufficient_data']),
    observations: z.number().int().nonnegative(),
    coverage: z.number().min(0).max(1).nullable(),
    confidence: decisionConfidence,
    summary: decisionText,
    sources: decisionSources,
    missing: decisionSources,
    href: z.string().max(240).nullable(),
  })
  .strict();

export const decisionFactsDtoSchema = z
  .object({
    goalsActive: z.number().int().nonnegative(),
    goalsCompleted: z.number().int().nonnegative(),
    strategicGoals: z.number().int().nonnegative(),
    projectsActive: z.number().int().nonnegative(),
    projectsCompleted: z.number().int().nonnegative(),
    tasksOpen: z.number().int().nonnegative(),
    tasksOverdue: z.number().int().nonnegative(),
    tasksBlocked: z.number().int().nonnegative(),
    tasksCompleted: z.number().int().nonnegative(),
    cycleObjectives: z.number().int().nonnegative(),
    weeklyReviewCount: z.number().int().nonnegative(),
    quarterlyReviewCount: z.number().int().nonnegative(),
    importBatches: z.number().int().nonnegative(),
    financeExpenseCents: decisionCents,
    financeExpenses: z.number().int().nonnegative(),
    healthObservations: z.number().int().nonnegative(),
    trainingObservations: z.number().int().nonnegative(),
    readingObservations: z.number().int().nonnegative(),
    timeObservations: z.number().int().nonnegative(),
    timeMinutes: z.number().int().nonnegative(),
    studySessions: z.number().int().nonnegative(),
    studyMinutes: z.number().int().nonnegative(),
    capacityWeeklyMinutes: z.number().int().nonnegative().nullable(),
    capacityContingencyPercent: z.number().int().nonnegative().nullable(),
    activeCycleId: z.string().max(120).nullable(),
    activeCycleName: z.string().max(200).nullable(),
    linkedReadingMaterials: z.number().int().nonnegative(),
  })
  .strict();

export const decisionComparisonDtoSchema = z
  .object({
    metric: z.string().max(120),
    current: z.number().finite().nullable(),
    previous: z.number().finite().nullable(),
    delta: z.number().finite().nullable(),
    changePercent: z.number().finite().nullable(),
    status: z.enum(['ok', 'insufficient_data']),
    coverage: z.number().min(0).max(1).nullable(),
    limitations: decisionLimitations,
  })
  .strict();

export const decisionReviewItemDtoSchema = z
  .object({
    label: decisionLabel,
    value: z.string().max(300),
    kind: z.enum(['observed', 'calculated', 'insufficient']),
    sources: decisionSources,
  })
  .strict();

export const decisionReviewDtoSchema = z
  .object({
    kind: decisionReviewKindSchema,
    period: decisionPeriodDtoSchema,
    previous: decisionPeriodDtoSchema,
    sections: z
      .array(
        z
          .object({
            title: decisionLabel,
            items: z.array(decisionReviewItemDtoSchema).max(20),
          })
          .strict(),
      )
      .max(10),
    comparisons: z.array(decisionComparisonDtoSchema).max(12),
    persistedSnapshot: z.boolean(),
    limitations: decisionLimitations,
    explanation: decisionExplanationDtoSchema,
    algorithmVersion: z.string().max(80),
  })
  .strict();
export type DecisionReviewDto = z.infer<typeof decisionReviewDtoSchema>;

export const decisionPlanningExecutionStateSchema = z.enum([
  'not_planned',
  'planned_not_executed',
  'partially_executed',
  'fully_executed',
  'insufficient_evidence',
  'not_applicable',
]);
export type DecisionPlanningExecutionState = z.infer<typeof decisionPlanningExecutionStateSchema>;

export const decisionPlanningExecutionItemDtoSchema = z
  .object({
    id: z.string().max(120),
    label: decisionLabel,
    definition: decisionText,
    state: decisionPlanningExecutionStateSchema,
    /** Valor planejado explícito; null quando não existe planejamento registrado. */
    plannedValue: z.number().finite().nullable(),
    /** Valor executado/observado; null quando não há evidência observável. */
    executedValue: z.number().finite().nullable(),
    /** Unidade de medida comparável; null quando não aplicável. */
    unit: z.string().max(32).nullable(),
    period: decisionPeriodDtoSchema,
    source: decisionSources,
    formula: decisionText,
    coverage: z.number().min(0).max(1).nullable(),
    confidence: decisionConfidence.nullable(),
    missing: decisionSources,
    limitations: decisionLimitations,
    algorithmVersion: z.string().max(80),
    /** Capacidade configurada, distinta de alocação planejada. */
    configuredCapacityValue: z.number().finite().nullable(),
    /** Alocação planejada explícita; null quando não existe. */
    allocatedPlannedValue: z.number().finite().nullable(),
    /** Planejamento explícito existe? false impede classificar como não executado. */
    hasExplicitPlan: z.boolean(),
    /** Execução registrada existe? false impede assumir execução zero. */
    hasExecutionRecord: z.boolean(),
    /** Unidades/períodos comparáveis para percentual? */
    comparable: z.boolean(),
    /** Percentual apenas quando comparável e denominador válido. */
    fulfillmentPercent: z.number().finite().nullable(),
  })
  .strict();
export type DecisionPlanningExecutionItemDto = z.infer<
  typeof decisionPlanningExecutionItemDtoSchema
>;

export const decisionPlanningExecutionDtoSchema = z
  .object({
    period: decisionPeriodDtoSchema,
    timezone: z.string().max(80),
    items: z.array(decisionPlanningExecutionItemDtoSchema).max(12),
    limitations: decisionLimitations,
    algorithmVersion: z.string().max(80),
  })
  .strict();
export type DecisionPlanningExecutionDto = z.infer<typeof decisionPlanningExecutionDtoSchema>;

export const decisionLongitudinalIndicatorDtoSchema = z
  .object({
    id: z.string().max(120),
    domain: z.string().max(80),
    label: decisionLabel,
    unit: z.string().max(32),
    source: z.string().max(80),
    status: z.enum(['observed', 'calculated', 'unavailable']),
    currentValue: z.number().finite().nullable(),
    previousValue: z.number().finite().nullable(),
    delta: z.number().finite().nullable(),
    changePercent: z.number().finite().nullable(),
    direction: z.enum(['up', 'down', 'stable', 'unknown']),
    observedPoints: z.number().int().nonnegative(),
    coverage: z.number().min(0).max(1).nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    period: decisionPeriodDtoSchema,
    previousPeriod: decisionPeriodDtoSchema,
    limitations: decisionLimitations,
    algorithmVersion: z.string().max(80),
  })
  .strict();
export type DecisionLongitudinalIndicatorDto = z.infer<
  typeof decisionLongitudinalIndicatorDtoSchema
>;

export const decisionHumanFeedbackDtoSchema = z
  .object({
    accepted: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    deferred: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    period: decisionPeriodDtoSchema,
    note: decisionText,
    limitations: decisionLimitations,
    algorithmVersion: z.string().max(80),
  })
  .strict();
export type DecisionHumanFeedbackDto = z.infer<typeof decisionHumanFeedbackDtoSchema>;

export const decisionDashboardDtoSchema = z
  .object({
    date: planLocalDate,
    generatedAt: planInstant,
    timezone: z.string().max(80),
    periods: decisionPeriodsDtoSchema,
    areas: z.array(decisionAreaIndicatorDtoSchema).max(12),
    facts: decisionFactsDtoSchema,
    sufficiency: z.record(z.string(), decisionSufficiencyDtoSchema),
    comparisons: z.array(decisionComparisonDtoSchema).max(12),
    planningExecution: decisionPlanningExecutionDtoSchema,
    longitudinalIndicators: z.array(decisionLongitudinalIndicatorDtoSchema).max(18),
    humanFeedback: decisionHumanFeedbackDtoSchema,
    alerts: z.array(decisionAlertDtoSchema).max(20),
    recommendations: z.array(decisionRecommendationDtoSchema).max(8),
    nextAction: decisionNextActionDtoSchema,
    crossDomainSummary: z.array(decisionCrossDomainDtoSchema).max(7),
    // Inclui a fórmula e os pesos versionados, que são descritivos, não apenas versões.
    algorithms: z.record(z.string(), decisionText),
    limitations: decisionLimitations,
  })
  .strict();
export type DecisionDashboardDto = z.infer<typeof decisionDashboardDtoSchema>;

const decisionPeriodFields = {
  comparison: decisionComparisonSchema.optional(),
  from: planLocalDate.optional(),
  to: planLocalDate.optional(),
  /** Limite informado pelo usuário; nenhum limite é assumido quando ausente. */
  financeLimitCents: z.coerce.number().int().nonnegative().max(1_000_000_000_000).optional(),
};

export const decisionPeriodQuerySchema = z
  .object(decisionPeriodFields)
  .strict()
  .refine((value) => (value.from === undefined) === (value.to === undefined), {
    path: ['from'],
    message: 'Informe from e to juntos.',
  })
  .refine((value) => value.from === undefined || value.to === undefined || value.to >= value.from, {
    path: ['to'],
    message: 'A data final não pode anteceder a inicial.',
  });
export type DecisionPeriodQuery = z.infer<typeof decisionPeriodQuerySchema>;

const decisionPageFields = {
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(256).optional(),
};

export const decisionAlertsQuerySchema = decisionPeriodQuerySchema.extend({
  ...decisionPageFields,
  severity: decisionSeveritySchema.optional(),
  area: z.string().max(80).optional(),
  state: decisionAlertStateSchema.optional(),
});
export type DecisionAlertsQuery = z.infer<typeof decisionAlertsQuerySchema>;

export const decisionListQuerySchema = decisionPeriodQuerySchema.extend(decisionPageFields);
export type DecisionListQuery = z.infer<typeof decisionListQuerySchema>;

export const decisionReviewQuerySchema = z
  .object({
    ...decisionPeriodFields,
    kind: decisionReviewKindSchema,
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
export type DecisionReviewQuery = z.infer<typeof decisionReviewQuerySchema>;

export const decisionAlertMutationSchema = z
  .object({
    version: z.number().int().positive().max(1_000_000),
  })
  .strict();
export type DecisionAlertMutation = z.infer<typeof decisionAlertMutationSchema>;

export const decisionAlertStateResultDtoSchema = z
  .object({
    alert: z
      .object({
        id: z.string().max(120),
        state: decisionAlertStateSchema,
        version: z.number().int().positive(),
      })
      .strict(),
    state: decisionAlertActionSchema,
    version: z.number().int().positive(),
  })
  .strict();
export type DecisionAlertStateResultDto = z.infer<typeof decisionAlertStateResultDtoSchema>;
