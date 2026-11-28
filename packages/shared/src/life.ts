import { z } from 'zod';

const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data local inválida.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Data local inválida.');

const instant = z.iso.datetime({ offset: false });
const text = (max: number) => z.string().min(1).max(max);
const nullableText = (max: number) => z.string().max(max).nullable();
const cents = z.number().int().nonnegative();
const signedCents = z.number().int();
const positiveInt = z.number().int().positive();
const identifier = z.string().min(1).max(64);

export const lifeDomainSchema = z.enum([
  'finance_accounts',
  'finance_categories',
  'finance_transactions',
  'finance_balance_items',
  'health_metrics',
  'health_observations',
  'training_sessions',
  'reading_materials',
  'reading_sessions',
  'reading_notes',
  'time_entries',
]);
export type LifeDomainDto = z.infer<typeof lifeDomainSchema>;

export const importFormatSchema = z.enum(['csv', 'json']);
export const lifeOriginKindSchema = z.enum([
  'observed',
  'estimated',
  'derived',
  'imported',
  'corrected',
]);
export const lifeRecordStatusSchema = z.enum(['active', 'superseded', 'archived']);

/** Proveniência comum: toda entidade de domínio carrega rastro verificável. */
const provenance = {
  id: identifier,
  version: positiveInt,
  sourceId: z.string(),
  externalId: z.string().nullable(),
  originKind: lifeOriginKindSchema,
  confidence: z.number().int().min(0).max(100).nullable(),
  algorithmVersion: z.string().nullable(),
  status: lifeRecordStatusSchema,
  supersededBy: z.string().nullable(),
  correctsId: z.string().nullable(),
  createdAt: instant,
  updatedAt: instant,
};

export const lifePeriodQuerySchema = z
  .object({
    from: localDate,
    to: localDate,
    limit: z.coerce.number().int().min(1).max(200).optional(),
    cursor: z.string().max(512).optional(),
  })
  .strict()
  .refine((value) => value.to >= value.from, {
    path: ['to'],
    message: 'A data final não pode anteceder a inicial.',
  });
export type LifePeriodQuery = z.infer<typeof lifePeriodQuerySchema>;

export const lifeHistoryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    cursor: z.string().max(512).optional(),
  })
  .strict();
export type LifeHistoryQuery = z.infer<typeof lifeHistoryQuerySchema>;

export const lifeEmptyQuerySchema = z.object({}).strict();

/* -------------------------------------------------------------- Finanças */

export const financeAccountDtoSchema = z.object({
  ...provenance,
  name: text(200),
  type: z.enum(['checking', 'savings', 'cash', 'investment']),
  currency: z.string().length(3),
  initialBalanceCents: signedCents,
  includeInPatrimony: z.boolean(),
});
export type FinanceAccountDto = z.infer<typeof financeAccountDtoSchema>;
export const createFinanceAccountSchema = z
  .object({
    name: text(200),
    type: z.enum(['checking', 'savings', 'cash', 'investment']).optional(),
    currency: z.string().length(3).optional(),
    initialBalanceCents: signedCents.optional(),
    includeInPatrimony: z.boolean().optional(),
    externalId: identifier.nullable().optional(),
  })
  .strict();
export type CreateFinanceAccount = z.infer<typeof createFinanceAccountSchema>;
export const updateFinanceAccountSchema = createFinanceAccountSchema
  .partial()
  .extend({ correctionNote: nullableText(500).optional() })
  .strict();
export type UpdateFinanceAccount = z.infer<typeof updateFinanceAccountSchema>;

export const financeCategoryDtoSchema = z.object({
  ...provenance,
  name: text(120),
  kind: z.enum(['income', 'expense']),
});
export type FinanceCategoryDto = z.infer<typeof financeCategoryDtoSchema>;
export const createFinanceCategorySchema = z
  .object({
    name: text(120),
    kind: z.enum(['income', 'expense']),
    externalId: identifier.nullable().optional(),
  })
  .strict();
export type CreateFinanceCategory = z.infer<typeof createFinanceCategorySchema>;
export const updateFinanceCategorySchema = createFinanceCategorySchema
  .partial()
  .extend({ correctionNote: nullableText(500).optional() })
  .strict();
export type UpdateFinanceCategory = z.infer<typeof updateFinanceCategorySchema>;

export const financeTransactionDtoSchema = z.object({
  ...provenance,
  accountId: identifier,
  categoryId: identifier.nullable(),
  kind: z.enum(['income', 'expense', 'transfer']),
  amountCents: cents,
  currency: z.string().length(3),
  date: localDate,
  description: text(300),
  notes: nullableText(1_000),
  transferPairId: identifier.nullable(),
  importBatchId: identifier.nullable(),
});
export type FinanceTransactionDto = z.infer<typeof financeTransactionDtoSchema>;
export const createFinanceTransactionSchema = z
  .object({
    accountId: identifier,
    categoryId: identifier.nullable().optional(),
    kind: z.enum(['income', 'expense', 'transfer']),
    amountCents: cents,
    currency: z.string().length(3).optional(),
    date: localDate,
    description: text(300),
    notes: nullableText(1_000).optional(),
    transferPairId: identifier.nullable().optional(),
    externalId: identifier.nullable().optional(),
  })
  .strict();
export type CreateFinanceTransaction = z.infer<typeof createFinanceTransactionSchema>;
export const updateFinanceTransactionSchema = createFinanceTransactionSchema
  .partial()
  .extend({ correctionNote: nullableText(500).optional() })
  .strict();
export type UpdateFinanceTransaction = z.infer<typeof updateFinanceTransactionSchema>;

export const financeBalanceItemDtoSchema = z.object({
  ...provenance,
  kind: z.enum(['asset', 'debt']),
  accountId: identifier.nullable(),
  name: text(200),
  amountCents: cents,
  currency: z.string().length(3),
  date: localDate,
  importBatchId: identifier.nullable(),
});
export type FinanceBalanceItemDto = z.infer<typeof financeBalanceItemDtoSchema>;
export const createFinanceBalanceItemSchema = z
  .object({
    kind: z.enum(['asset', 'debt']),
    accountId: identifier.nullable().optional(),
    name: text(200),
    amountCents: cents,
    currency: z.string().length(3).optional(),
    date: localDate,
    externalId: identifier.nullable().optional(),
  })
  .strict();
export type CreateFinanceBalanceItem = z.infer<typeof createFinanceBalanceItemSchema>;
export const updateFinanceBalanceItemSchema = createFinanceBalanceItemSchema
  .partial()
  .extend({ correctionNote: nullableText(500).optional() })
  .strict();
export type UpdateFinanceBalanceItem = z.infer<typeof updateFinanceBalanceItemSchema>;

/* ---------------------------------------------------------------- Saúde */

export const healthMetricDtoSchema = z.object({
  ...provenance,
  key: text(64),
  label: text(120),
  unit: text(20),
  valueKind: z.enum(['integer', 'scale']),
});
export type HealthMetricDto = z.infer<typeof healthMetricDtoSchema>;
export const createHealthMetricSchema = z
  .object({
    key: text(64),
    label: text(120),
    unit: text(20),
    valueKind: z.enum(['integer', 'scale']).optional(),
    externalId: identifier.nullable().optional(),
  })
  .strict();
export type CreateHealthMetric = z.infer<typeof createHealthMetricSchema>;
export const updateHealthMetricSchema = createHealthMetricSchema
  .partial()
  .extend({ correctionNote: nullableText(500).optional() })
  .strict();
export type UpdateHealthMetric = z.infer<typeof updateHealthMetricSchema>;

export const healthObservationDtoSchema = z.object({
  ...provenance,
  metricId: identifier,
  date: localDate,
  value: z.number().int(),
  note: nullableText(1_000),
});
export type HealthObservationDto = z.infer<typeof healthObservationDtoSchema>;
export const createHealthObservationSchema = z
  .object({
    metricId: identifier,
    date: localDate,
    value: z.number().int(),
    note: nullableText(1_000).optional(),
    externalId: identifier.nullable().optional(),
  })
  .strict();
export type CreateHealthObservation = z.infer<typeof createHealthObservationSchema>;
export const updateHealthObservationSchema = createHealthObservationSchema
  .partial()
  .extend({ correctionNote: nullableText(500).optional() })
  .strict();
export type UpdateHealthObservation = z.infer<typeof updateHealthObservationSchema>;

/* ---------------------------------------------------------- Treinamento */

export const trainingSessionDtoSchema = z.object({
  ...provenance,
  activityType: text(80),
  date: localDate,
  durationMinutes: z.number().int().min(1).max(1_440),
  volume: z.number().int().nonnegative().nullable(),
  distanceMeters: z.number().int().nonnegative().nullable(),
  intensity: z.number().int().min(1).max(10).nullable(),
  note: nullableText(1_000),
});
export type TrainingSessionDto = z.infer<typeof trainingSessionDtoSchema>;
export const createTrainingSessionSchema = z
  .object({
    activityType: text(80),
    date: localDate,
    durationMinutes: z.number().int().min(1).max(1_440),
    volume: z.number().int().nonnegative().nullable().optional(),
    distanceMeters: z.number().int().nonnegative().nullable().optional(),
    intensity: z.number().int().min(1).max(10).nullable().optional(),
    note: nullableText(1_000).optional(),
    externalId: identifier.nullable().optional(),
  })
  .strict();
export type CreateTrainingSession = z.infer<typeof createTrainingSessionSchema>;
export const updateTrainingSessionSchema = createTrainingSessionSchema
  .partial()
  .extend({ correctionNote: nullableText(500).optional() })
  .strict();
export type UpdateTrainingSession = z.infer<typeof updateTrainingSessionSchema>;

/* -------------------------------------------------------------- Leitura */

export const readingMaterialDtoSchema = z.object({
  ...provenance,
  title: text(300),
  author: nullableText(200),
  kind: z.enum(['book', 'article', 'material']),
  status: z.enum(['planned', 'reading', 'finished', 'paused']),
  totalPages: z.number().int().min(1).max(20_000).nullable(),
  goalId: identifier.nullable(),
  courseId: identifier.nullable(),
});
export type ReadingMaterialDto = z.infer<typeof readingMaterialDtoSchema>;
export const createReadingMaterialSchema = z
  .object({
    title: text(300),
    author: nullableText(200).optional(),
    kind: z.enum(['book', 'article', 'material']).optional(),
    status: z.enum(['planned', 'reading', 'finished', 'paused']).optional(),
    totalPages: z.number().int().min(1).max(20_000).nullable().optional(),
    goalId: identifier.nullable().optional(),
    courseId: identifier.nullable().optional(),
    externalId: identifier.nullable().optional(),
  })
  .strict();
export type CreateReadingMaterial = z.infer<typeof createReadingMaterialSchema>;
export const updateReadingMaterialSchema = createReadingMaterialSchema
  .partial()
  .extend({ correctionNote: nullableText(500).optional() })
  .strict();
export type UpdateReadingMaterial = z.infer<typeof updateReadingMaterialSchema>;

export const readingSessionDtoSchema = z.object({
  ...provenance,
  materialId: identifier,
  date: localDate,
  minutes: z.number().int().min(1).max(1_440).nullable(),
  pagesRead: z.number().int().nonnegative().nullable(),
  note: nullableText(1_000),
});
export type ReadingSessionDto = z.infer<typeof readingSessionDtoSchema>;
export const createReadingSessionSchema = z
  .object({
    materialId: identifier,
    date: localDate,
    minutes: z.number().int().min(1).max(1_440).nullable().optional(),
    pagesRead: z.number().int().nonnegative().nullable().optional(),
    note: nullableText(1_000).optional(),
    externalId: identifier.nullable().optional(),
  })
  .strict();
export type CreateReadingSession = z.infer<typeof createReadingSessionSchema>;
export const updateReadingSessionSchema = createReadingSessionSchema
  .partial()
  .extend({ correctionNote: nullableText(500).optional() })
  .strict();
export type UpdateReadingSession = z.infer<typeof updateReadingSessionSchema>;

export const readingNoteDtoSchema = z.object({
  ...provenance,
  materialId: identifier,
  date: localDate,
  kind: z.enum(['note', 'learning']),
  content: text(4_000),
});
export type ReadingNoteDto = z.infer<typeof readingNoteDtoSchema>;
export const createReadingNoteSchema = z
  .object({
    materialId: identifier,
    date: localDate,
    kind: z.enum(['note', 'learning']).optional(),
    content: text(4_000),
    externalId: identifier.nullable().optional(),
  })
  .strict();
export type CreateReadingNote = z.infer<typeof createReadingNoteSchema>;
export const updateReadingNoteSchema = createReadingNoteSchema
  .partial()
  .extend({ correctionNote: nullableText(500).optional() })
  .strict();
export type UpdateReadingNote = z.infer<typeof updateReadingNoteSchema>;

/* ------------------------------------------------------------------ Tempo */

export const timeEntryDtoSchema = z.object({
  ...provenance,
  taskId: identifier.nullable(),
  projectId: identifier.nullable(),
  areaId: identifier.nullable(),
  date: localDate,
  startAt: instant.nullable(),
  endAt: instant.nullable(),
  durationMinutes: z.number().int().min(1).max(1_440),
  note: nullableText(1_000),
  importBatchId: identifier.nullable(),
});
export type TimeEntryDto = z.infer<typeof timeEntryDtoSchema>;
const timeEntryFields = {
  taskId: identifier.nullable().optional(),
  projectId: identifier.nullable().optional(),
  areaId: identifier.nullable().optional(),
  date: localDate,
  startAt: instant.nullable().optional(),
  endAt: instant.nullable().optional(),
  durationMinutes: z.number().int().min(1).max(1_440).optional(),
  note: nullableText(1_000).optional(),
  externalId: identifier.nullable().optional(),
};

function validInterval(value: {
  readonly startAt?: string | null;
  readonly endAt?: string | null;
}): boolean {
  if (value.startAt === undefined || value.endAt === undefined) {
    return value.startAt === undefined && value.endAt === undefined;
  }
  if (value.startAt === null || value.endAt === null) {
    return value.startAt === null && value.endAt === null;
  }
  return Date.parse(value.endAt) > Date.parse(value.startAt);
}

export const createTimeEntrySchema = z
  .object(timeEntryFields)
  .strict()
  .refine(validInterval, {
    path: ['endAt'],
    message: 'Informe início e fim válidos, com fim posterior ao início.',
  })
  .refine(
    (value) =>
      value.durationMinutes !== undefined ||
      (typeof value.startAt === 'string' && typeof value.endAt === 'string'),
    { path: ['durationMinutes'], message: 'Informe duração ou intervalo completo.' },
  );
export type CreateTimeEntry = z.infer<typeof createTimeEntrySchema>;
export const updateTimeEntrySchema = z
  .object(timeEntryFields)
  .partial()
  .extend({ correctionNote: nullableText(500).optional() })
  .strict()
  .refine(validInterval, {
    path: ['endAt'],
    message: 'Informe início e fim válidos, com fim posterior ao início.',
  });
export type UpdateTimeEntry = z.infer<typeof updateTimeEntrySchema>;

/* ----------------------------------------------------------- Importação */

export const lifeImportPreviewRequestSchema = z
  .object({
    domain: lifeDomainSchema,
    format: importFormatSchema,
    content: z.string().min(1).max(12_000),
  })
  .strict();
export type LifeImportPreviewRequest = z.infer<typeof lifeImportPreviewRequestSchema>;

export const lifeImportCommitRequestSchema = lifeImportPreviewRequestSchema
  .extend({
    fileName: z.string().max(120).optional(),
    confirm: z.literal(true),
  })
  .strict();
export type LifeImportCommitRequest = z.infer<typeof lifeImportCommitRequestSchema>;

export const importIssueDtoSchema = z.object({
  row: z.number().int().positive(),
  code: z.enum(['invalid_row', 'unexpected_column', 'unsafe_content', 'duplicate', 'invalid_json']),
  message: z.string().max(200),
});
export type ImportIssueDto = z.infer<typeof importIssueDtoSchema>;

export const importPreviewRowDtoSchema = z.object({
  row: z.number().int().positive(),
  status: z.enum(['valid', 'invalid', 'duplicate']),
  record: z.record(z.string(), z.unknown()).nullable(),
  issues: z.array(importIssueDtoSchema),
});
export type ImportPreviewRowDto = z.infer<typeof importPreviewRowDtoSchema>;

export const importPreviewDtoSchema = z.object({
  domain: lifeDomainSchema,
  format: importFormatSchema,
  expectedColumns: z.array(z.string()),
  rows: z.array(importPreviewRowDtoSchema),
  total: z.number().int().nonnegative(),
  valid: z.number().int().nonnegative(),
  invalid: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  limitations: z.array(z.string()),
});
export type ImportPreviewDto = z.infer<typeof importPreviewDtoSchema>;

export const importReportDtoSchema = z.object({
  batchId: identifier,
  domain: lifeDomainSchema,
  format: importFormatSchema,
  fileName: z.string().nullable(),
  total: z.number().int().nonnegative(),
  imported: z.number().int().nonnegative(),
  invalid: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  issues: z.array(importIssueDtoSchema),
});
export type ImportReportDto = z.infer<typeof importReportDtoSchema>;

export const importBatchDtoSchema = z.object({
  id: identifier,
  domain: lifeDomainSchema,
  format: importFormatSchema,
  fileName: z.string().nullable(),
  total: z.number().int().nonnegative(),
  imported: z.number().int().nonnegative(),
  invalid: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  createdAt: instant,
});
export type ImportBatchDto = z.infer<typeof importBatchDtoSchema>;

/* ------------------------------------------------------------ Indicadores */

export const lifeCoverageDtoSchema = z.object({
  from: localDate,
  to: localDate,
  observationCount: z.number().int().nonnegative(),
  daysWithRecords: z.number().int().nonnegative(),
  expectedDays: z.number().int().positive(),
  coverageRatio: z.number().min(0).max(1).nullable(),
  limitations: z.array(z.string()),
});
export type LifeCoverageDto = z.infer<typeof lifeCoverageDtoSchema>;

export const financeSummaryDtoSchema = z.object({
  from: localDate,
  to: localDate,
  incomeCents: signedCents,
  expenseCents: cents,
  netCents: signedCents,
  transfersExcluded: z.number().int().nonnegative(),
  byCategory: z.array(z.object({ categoryId: identifier, amountCents: cents })),
  cashflow: z.array(z.object({ date: localDate, incomeCents: cents, expenseCents: cents })),
  patrimonyCents: signedCents.nullable(),
  coverage: lifeCoverageDtoSchema,
  limitations: z.array(z.string()),
  algorithmVersion: z.string(),
});
export type FinanceSummaryDto = z.infer<typeof financeSummaryDtoSchema>;

export const healthSummaryDtoSchema = z.object({
  metrics: z.array(
    z.object({
      metricKey: text(64),
      observationCount: z.number().int().nonnegative(),
      latestValue: z.number().int().nullable(),
      latestDate: localDate.nullable(),
    }),
  ),
  coverage: lifeCoverageDtoSchema,
  limitations: z.array(z.string()),
  algorithmVersion: z.string(),
});
export type HealthSummaryDto = z.infer<typeof healthSummaryDtoSchema>;

export const trainingSummaryDtoSchema = z.object({
  sessionCount: z.number().int().nonnegative(),
  durationMinutes: z.number().int().nonnegative(),
  volume: z.number().int().nonnegative(),
  distanceMeters: z.number().int().nonnegative(),
  byActivity: z.array(
    z.object({
      activityType: text(80),
      sessionCount: z.number().int().nonnegative(),
      durationMinutes: z.number().int().nonnegative(),
      volume: z.number().int().nonnegative(),
    }),
  ),
  weeksWithRecords: z.number().int().nonnegative(),
  consistencyRatio: z.number().min(0).max(1).nullable(),
  coverage: lifeCoverageDtoSchema,
  limitations: z.array(z.string()),
  algorithmVersion: z.string(),
});
export type TrainingSummaryDto = z.infer<typeof trainingSummaryDtoSchema>;

export const readingSummaryDtoSchema = z.object({
  started: z.number().int().nonnegative(),
  finished: z.number().int().nonnegative(),
  minutes: z.number().int().nonnegative(),
  pagesRead: z.number().int().nonnegative(),
  progressByMaterial: z.array(
    z.object({
      materialId: identifier,
      readPages: z.number().int().nonnegative(),
      totalPages: z.number().int().positive().nullable(),
      progressRatio: z.number().min(0).max(1).nullable(),
    }),
  ),
  coverage: lifeCoverageDtoSchema,
  limitations: z.array(z.string()),
  algorithmVersion: z.string(),
});
export type ReadingSummaryDto = z.infer<typeof readingSummaryDtoSchema>;

export const timeSummaryDtoSchema = z.object({
  observedMinutes: z.number().int().nonnegative(),
  estimatedMinutes: z.number().int().nonnegative(),
  differenceMinutes: signedCents.nullable(),
  byProject: z.array(z.object({ projectId: identifier, minutes: z.number().int().nonnegative() })),
  byTask: z.array(z.object({ taskId: identifier, minutes: z.number().int().nonnegative() })),
  byArea: z.array(z.object({ areaId: identifier, minutes: z.number().int().nonnegative() })),
  overlappingPairs: z.number().int().nonnegative(),
  duplicateIntervalsIgnored: z.number().int().nonnegative(),
  coverage: lifeCoverageDtoSchema,
  limitations: z.array(z.string()),
  algorithmVersion: z.string(),
});
export type TimeSummaryDto = z.infer<typeof timeSummaryDtoSchema>;

export const lifeIntegrationDtoSchema = z.object({
  from: localDate,
  to: localDate,
  sources: z.array(z.string()),
  observationCount: z.number().int().nonnegative(),
  coverage: lifeCoverageDtoSchema,
  relations: z.array(
    z.object({
      id: z.string(),
      sources: z.array(z.string()),
      observationCount: z.number().int().nonnegative(),
      description: z.string(),
      limitation: z.string(),
    }),
  ),
  limitations: z.array(z.string()),
  algorithmVersion: z.string(),
});
export type LifeIntegrationDto = z.infer<typeof lifeIntegrationDtoSchema>;

export const lifeDashboardDtoSchema = z.object({
  period: z.object({ from: localDate, to: localDate }),
  domains: z.array(
    z.object({
      domain: lifeDomainSchema,
      label: z.string(),
      available: z.boolean(),
      recordCount: z.number().int().nonnegative(),
    }),
  ),
  integration: lifeIntegrationDtoSchema,
  algorithms: z.record(z.string(), z.string()),
});
export type LifeDashboardDto = z.infer<typeof lifeDashboardDtoSchema>;
