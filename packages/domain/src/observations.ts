import { businessRule, validationError } from './errors';
import {
  assertIanaTimezone,
  assertLocalDate,
  dayCount,
  isLocalDate,
  localDateFor,
} from './studies';

export const PERSONAL_OBSERVATION_KINDS = [
  'intention',
  'planning',
  'executed',
  'observed_result',
  'confirmed_result',
  'inference',
] as const;
export type PersonalObservationKind = (typeof PERSONAL_OBSERVATION_KINDS)[number];

export const PERSONAL_OBSERVATION_STATUSES = ['active', 'superseded', 'archived'] as const;
export type PersonalObservationStatus = (typeof PERSONAL_OBSERVATION_STATUSES)[number];

export const OBSERVATION_SUMMARY_ALGORITHM = 'personal-observation-summary-v1';
export const MAX_OBSERVATION_EVIDENCE = 20;
export const MAX_OBSERVATION_RANGE_DAYS = 366;
export const MAX_OBSERVATION_PAGE_SIZE = 200;
export const DEFAULT_OBSERVATION_PAGE_SIZE = 50;

export interface ObservationEvidenceRef {
  type: string;
  id: string;
  label?: string;
}

export interface PersonalObservationRecord {
  id: string;
  areaId: string | null;
  areaKey: string | null;
  areaName: string | null;
  kind: PersonalObservationKind;
  title: string;
  content: string | null;
  observedAt: string;
  localDate: string;
  timezone: string;
  valueNum: number | null;
  valueText: string | null;
  unit: string | null;
  sourceId: string;
  confidence: number | null;
  algorithmVersion: string | null;
  evidence: readonly ObservationEvidenceRef[];
  relatedTaskId: string | null;
  relatedProjectId: string | null;
  relatedGoalId: string | null;
  relatedStudySessionId: string | null;
  relatedCourseId: string | null;
  status: PersonalObservationStatus;
  supersededBy: string | null;
  correctsId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export function assertObservationKind(value: string): PersonalObservationKind {
  if ((PERSONAL_OBSERVATION_KINDS as readonly string[]).includes(value)) {
    return value as PersonalObservationKind;
  }
  throw validationError('Tipo de observação inválido.');
}

export function assertObservationStatus(value: string): PersonalObservationStatus {
  if ((PERSONAL_OBSERVATION_STATUSES as readonly string[]).includes(value)) {
    return value as PersonalObservationStatus;
  }
  throw validationError('Status de observação inválido.');
}

export function parseEvidenceJson(raw: string | null): ObservationEvidenceRef[] {
  if (raw === null || raw.trim() === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw businessRule('Evidência da observação está inválida.');
  }
  if (!Array.isArray(parsed)) throw businessRule('Evidência da observação está inválida.');
  if (parsed.length > MAX_OBSERVATION_EVIDENCE) {
    throw validationError(`Máximo de ${MAX_OBSERVATION_EVIDENCE} evidências por observação.`);
  }
  return parsed.map((item) => {
    if (typeof item !== 'object' || item === null) {
      throw businessRule('Evidência da observação está inválida.');
    }
    const ref = item as Record<string, unknown>;
    if (typeof ref.type !== 'string' || typeof ref.id !== 'string') {
      throw businessRule('Evidência da observação está inválida.');
    }
    const out: ObservationEvidenceRef = { type: ref.type, id: ref.id };
    if (typeof ref.label === 'string') out.label = ref.label;
    return out;
  });
}

export function encodeEvidenceJson(
  evidence: readonly ObservationEvidenceRef[] | undefined,
): string | null {
  if (evidence === undefined || evidence.length === 0) return null;
  if (evidence.length > MAX_OBSERVATION_EVIDENCE) {
    throw validationError(`Máximo de ${MAX_OBSERVATION_EVIDENCE} evidências por observação.`);
  }
  return JSON.stringify(
    evidence.map((e) => ({ type: e.type, id: e.id, ...(e.label ? { label: e.label } : {}) })),
  );
}

export function assertObservationSemantics(input: {
  kind: PersonalObservationKind;
  confidence: number | null | undefined;
  sourceId?: string;
  algorithmVersion?: string | null | undefined;
}): void {
  if (input.kind === 'inference' && (input.confidence === null || input.confidence === undefined)) {
    throw validationError('Inferência exige confidence entre 0 e 1.');
  }
  if (
    input.confidence !== null &&
    input.confidence !== undefined &&
    (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)
  ) {
    throw validationError('Confidence deve estar entre 0 e 1.');
  }
  if (
    input.sourceId === 'src_inference' &&
    (input.confidence === null || input.confidence === undefined)
  ) {
    throw validationError('Observação com fonte de inferência exige confidence.');
  }
  if (input.sourceId === 'src_calculation' && !input.algorithmVersion) {
    throw validationError('Observação calculada exige algorithmVersion.');
  }
}

export function assertObservationRange(
  from: string,
  to: string,
  maxDays = MAX_OBSERVATION_RANGE_DAYS,
): { from: string; to: string } {
  const start = assertLocalDate(from, 'from');
  const end = assertLocalDate(to, 'to');
  const days = dayCount(start, end);
  if (days === 0) throw validationError('A data inicial não pode ser posterior à data final.');
  if (days > maxDays) throw businessRule(`Intervalo excede o limite de ${maxDays} dias.`);
  return { from: start, to: end };
}

export interface ObservationSummaryInput {
  id: string;
  localDate: string;
  kind: PersonalObservationKind;
  areaId: string | null;
  areaKey: string | null;
  areaName: string | null;
}

export interface ObservationAreaSummary {
  areaId: string | null;
  areaKey: string | null;
  areaName: string | null;
  observationCount: number;
  kinds: Record<string, number>;
}

export interface ObservationSummary {
  from: string;
  to: string;
  algorithmVersion: string;
  totalObservations: number;
  byArea: ObservationAreaSummary[];
  byKind: Record<string, number>;
  coverage: {
    daysInRange: number;
    daysWithObservations: number;
    coveragePercent: number | null;
    missingDays: number;
  };
  limitations: string[];
}

export function buildObservationSummary(
  observations: readonly ObservationSummaryInput[],
  range: { from: string; to: string },
): ObservationSummary {
  const { from, to } = assertObservationRange(range.from, range.to);
  const daysInRange = dayCount(from, to);
  const observedDays = new Set<string>();
  const byKind: Record<string, number> = {};
  const areaMap = new Map<string, ObservationAreaSummary>();

  for (const obs of observations) {
    if (!isLocalDate(obs.localDate)) continue;
    if (obs.localDate < from || obs.localDate > to) continue;
    observedDays.add(obs.localDate);
    byKind[obs.kind] = (byKind[obs.kind] ?? 0) + 1;
    const areaKey = obs.areaId ?? '__none__';
    const existing = areaMap.get(areaKey) ?? {
      areaId: obs.areaId,
      areaKey: obs.areaKey,
      areaName: obs.areaName,
      observationCount: 0,
      kinds: {},
    };
    existing.observationCount += 1;
    existing.kinds[obs.kind] = (existing.kinds[obs.kind] ?? 0) + 1;
    areaMap.set(areaKey, existing);
  }

  const daysWithObservations = observedDays.size;
  const missingDays = Math.max(0, daysInRange - daysWithObservations);
  const limitations: string[] = [];
  if (daysInRange > 0 && daysWithObservations === 0) {
    limitations.push(
      'Sem observações no período selecionado; ausência não foi preenchida com zero fictício.',
    );
  }
  if (daysWithObservations > 0 && missingDays > 0) {
    limitations.push(
      'Existem dias sem observação no período; cobertura parcial, sem imputação de zeros.',
    );
  }
  if (observations.length < 3) {
    limitations.push('Poucos pontos no período; evite inferir tendência ou causalidade.');
  }
  limitations.push(
    'Indicadores contam registros explícitos; não medem resultado real não observado.',
  );
  limitations.push(
    'Inferências são rotuladas como inferência e não devem ser tratadas como fato confirmado.',
  );

  return {
    from,
    to,
    algorithmVersion: OBSERVATION_SUMMARY_ALGORITHM,
    totalObservations: observations.length,
    byArea: [...areaMap.values()].sort((a, b) => b.observationCount - a.observationCount),
    byKind,
    coverage: {
      daysInRange,
      daysWithObservations,
      coveragePercent:
        daysInRange > 0 ? Math.round((daysWithObservations / daysInRange) * 100) : null,
      missingDays,
    },
    limitations,
  };
}

export function observationLocalDate(observedAt: string, timezone: string): string {
  assertIanaTimezone(timezone);
  const ms = Date.parse(observedAt);
  if (Number.isNaN(ms)) throw validationError('observedAt inválido.');
  return localDateFor(ms, timezone);
}
