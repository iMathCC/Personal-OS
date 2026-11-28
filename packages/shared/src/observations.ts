import { z } from 'zod';
import { successSchema } from './auth';

const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data local inválida.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Data local inválida.');

const instant = z.iso.datetime({ offset: false });
const timezone = z.string().min(1).max(64);
const identifier = z.string().min(1).max(64);
const nullableIdentifier = identifier.nullable();

export const personalObservationKindSchema = z.enum([
  'intention',
  'planning',
  'executed',
  'observed_result',
  'confirmed_result',
  'inference',
]);
export type PersonalObservationKind = z.infer<typeof personalObservationKindSchema>;

export const personalObservationStatusSchema = z.enum(['active', 'superseded', 'archived']);
export type PersonalObservationStatus = z.infer<typeof personalObservationStatusSchema>;

export const observationEvidenceRefSchema = z
  .object({
    type: z.string().min(1).max(64),
    id: z.string().min(1).max(64),
    label: z.string().max(200).optional(),
  })
  .strict();
export type ObservationEvidenceRef = z.infer<typeof observationEvidenceRefSchema>;

export const personalObservationDtoSchema = z.object({
  id: identifier,
  areaId: nullableIdentifier,
  kind: personalObservationKindSchema,
  title: z.string().min(1).max(200),
  content: z.string().max(5000).nullable(),
  observedAt: instant,
  localDate,
  timezone,
  valueNum: z.number().finite().nullable(),
  valueText: z.string().max(500).nullable(),
  unit: z.string().max(32).nullable(),
  sourceId: z.string().min(1).max(64),
  confidence: z.number().min(0).max(1).nullable(),
  algorithmVersion: z.string().max(64).nullable(),
  evidence: z.array(observationEvidenceRefSchema).max(20),
  relatedTaskId: nullableIdentifier,
  relatedProjectId: nullableIdentifier,
  relatedGoalId: nullableIdentifier,
  relatedStudySessionId: nullableIdentifier,
  relatedCourseId: nullableIdentifier,
  status: personalObservationStatusSchema,
  supersededBy: nullableIdentifier,
  correctsId: nullableIdentifier,
  version: z.number().int().positive(),
  createdAt: instant,
  updatedAt: instant,
});
export type PersonalObservationDto = z.infer<typeof personalObservationDtoSchema>;

export const createPersonalObservationRequestSchema = z
  .object({
    areaId: nullableIdentifier.optional(),
    kind: personalObservationKindSchema,
    title: z.string().min(1).max(200),
    content: z.string().max(5000).nullable().optional(),
    observedAt: instant,
    timezone,
    valueNum: z.number().finite().nullable().optional(),
    valueText: z.string().max(500).nullable().optional(),
    unit: z.string().max(32).nullable().optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
    evidence: z.array(observationEvidenceRefSchema).max(20).optional(),
    relatedTaskId: nullableIdentifier.optional(),
    relatedProjectId: nullableIdentifier.optional(),
    relatedGoalId: nullableIdentifier.optional(),
    relatedStudySessionId: nullableIdentifier.optional(),
    relatedCourseId: nullableIdentifier.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.kind === 'inference' &&
      (value.confidence === undefined || value.confidence === null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confidence'],
        message: 'Inferência exige confidence entre 0 e 1.',
      });
    }
  });
export type CreatePersonalObservationRequest = z.infer<
  typeof createPersonalObservationRequestSchema
>;

export const correctPersonalObservationRequestSchema = z
  .object({
    kind: personalObservationKindSchema.optional(),
    title: z.string().min(1).max(200).optional(),
    content: z.string().max(5000).nullable().optional(),
    observedAt: instant.optional(),
    timezone: timezone.optional(),
    valueNum: z.number().finite().nullable().optional(),
    valueText: z.string().max(500).nullable().optional(),
    unit: z.string().max(32).nullable().optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
    evidence: z.array(observationEvidenceRefSchema).max(20).optional(),
    areaId: nullableIdentifier.optional(),
    relatedTaskId: nullableIdentifier.optional(),
    relatedProjectId: nullableIdentifier.optional(),
    relatedGoalId: nullableIdentifier.optional(),
    relatedStudySessionId: nullableIdentifier.optional(),
    relatedCourseId: nullableIdentifier.optional(),
    reason: z.string().min(1).max(500).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((k) => k !== 'reason'), {
    message: 'Informe ao menos um campo para correção.',
  });
export type CorrectPersonalObservationRequest = z.infer<
  typeof correctPersonalObservationRequestSchema
>;

export const listPersonalObservationsQuerySchema = z
  .object({
    from: localDate.optional(),
    to: localDate.optional(),
    kind: personalObservationKindSchema.optional(),
    areaId: identifier.optional(),
    status: personalObservationStatusSchema.optional(),
    relatedTaskId: identifier.optional(),
    relatedProjectId: identifier.optional(),
    relatedGoalId: identifier.optional(),
    relatedStudySessionId: identifier.optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    cursor: z.string().max(512).optional(),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.to >= value.from, {
    path: ['to'],
    message: 'A data final não pode anteceder a inicial.',
  });
export type ListPersonalObservationsQuery = z.infer<typeof listPersonalObservationsQuerySchema>;

export const observationSummaryQuerySchema = z
  .object({
    from: localDate,
    to: localDate,
    areaId: identifier.optional(),
  })
  .strict()
  .refine((value) => value.to >= value.from, {
    path: ['to'],
    message: 'A data final não pode anteceder a inicial.',
  });
export type ObservationSummaryQuery = z.infer<typeof observationSummaryQuerySchema>;

export const observationAreaSummarySchema = z.object({
  areaId: z.string().nullable(),
  areaKey: z.string().nullable(),
  areaName: z.string().nullable(),
  observationCount: z.number().int().nonnegative(),
  kinds: z.record(z.string(), z.number().int().nonnegative()),
});

export const observationSummaryDtoSchema = z.object({
  from: localDate,
  to: localDate,
  algorithmVersion: z.string(),
  totalObservations: z.number().int().nonnegative(),
  byArea: z.array(observationAreaSummarySchema),
  byKind: z.record(z.string(), z.number().int().nonnegative()),
  coverage: z.object({
    daysInRange: z.number().int().nonnegative(),
    daysWithObservations: z.number().int().nonnegative(),
    coveragePercent: z.number().min(0).max(100).nullable(),
    missingDays: z.number().int().nonnegative(),
  }),
  limitations: z.array(z.string()),
});
export type ObservationSummaryDto = z.infer<typeof observationSummaryDtoSchema>;

export const personalObservationResponseSchema = successSchema(personalObservationDtoSchema);
export const personalObservationsResponseSchema = successSchema(
  z.array(personalObservationDtoSchema),
);
export const personalObservationsPageResponseSchema = z.object({
  data: z.array(personalObservationDtoSchema),
  meta: z.object({
    requestId: z.string(),
    nextCursor: z.string().optional(),
    hasMore: z.boolean(),
    truncated: z.boolean(),
  }),
});
export const observationSummaryResponseSchema = successSchema(observationSummaryDtoSchema);
