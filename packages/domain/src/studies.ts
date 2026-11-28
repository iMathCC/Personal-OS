import { businessRule, validationError } from './errors';

/** Limites explícitos de consulta e resposta da Entrega 5. */
export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_SERIES_DAYS = 366;
export const MAX_SERIES_WEEKS = 54;
export const MAX_QUERY_PAGES = 25;
export const RESULT_BODY_MAX_BYTES = 32_768;
export const ORIGINAL_BODY_MAX_BYTES = 16_384;
export const MIRROR_BODY_MAX_BYTES = 8_192;
export const ENVELOPE_MAX_BYTES = 65_536;
export const STUDY_MINUTES_ALGORITHM = 'study-minutes-v1';
export const STUDY_MINUTES_METRIC_KEY = 'study_minutes';
/** Fonte da observação derivada; nunca `src_manual` para dado gerado pelo sistema. */
export const STUDY_MINUTES_SOURCE_ID = 'src_calculation';
/** Versão do cálculo de progresso de metas por minutos acumulados. */
export const GOAL_PROGRESS_ALGORITHM = 'goal-minutes-progress-v1';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Codificação injetiva usada na chave canônica. O delimitador `|` nunca aparece
 * no alfabeto resultante, logo tuplos distintos produzem chaves distintas.
 */
export function encodeKeyPart(value: string): string {
  const encoded = encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return encoded.replace(/%[0-9A-F]{2}/g, (match) => match.toUpperCase());
}

/** Chave canônica: v1|subject|method|path|clientKey. */
export function canonicalIdempotencyKey(
  subject: string,
  method: string,
  path: string,
  clientKey: string,
): string {
  return [
    'v1',
    encodeKeyPart(subject),
    encodeKeyPart(method.toUpperCase()),
    encodeKeyPart(path),
    encodeKeyPart(clientKey),
  ].join('|');
}

/** Detecta caracteres de controle sem regex literals (regra `no-control-regex`). */
function hasControlChars(value: string): boolean {
  return Array.from(value).some((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f;
  });
}

/** Valida o formato do cabeçalho `Idempotency-Key` antes de compor a chave. */
export function assertClientKey(clientKey: string | null | undefined): string {
  if (clientKey === null || clientKey === undefined) {
    throw validationError('Cabeçalho Idempotency-Key obrigatório.');
  }
  const normalized = clientKey.normalize('NFC');
  const bytes = new TextEncoder().encode(normalized).byteLength;
  if (bytes < 1 || bytes > 200 || hasControlChars(normalized) || normalized !== normalized.trim()) {
    throw validationError('Idempotency-Key inválida.');
  }
  return normalized;
}

/** Valida o caminho que entra na identidade da operação. */
export function assertOperationPath(path: string): string {
  const bytes = new TextEncoder().encode(path).byteLength;
  if (!path.startsWith('/') || bytes > 512 || hasControlChars(path)) {
    throw validationError('Caminho da operação inválido.');
  }
  return path;
}

export function isIanaTimezone(timezone: string): boolean {
  if (timezone.length === 0 || timezone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function assertIanaTimezone(timezone: string): string {
  if (!isIanaTimezone(timezone)) {
    throw validationError('Timezone IANA inválida.');
  }
  return timezone;
}

/** `local_date` no fuso do usuário — nunca no fuso do servidor. */
export function localDateFor(instantMs: number, timezone: string): string {
  assertIanaTimezone(timezone);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instantMs));
}

export function isLocalDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function assertLocalDate(value: string, field = 'data'): string {
  if (!isLocalDate(value)) throw validationError(`${field} inválida.`);
  return value;
}

export interface DateRange {
  from: string;
  to: string;
}

export function assertDateRange(range: DateRange, maxDays = MAX_SERIES_DAYS): DateRange {
  const from = assertLocalDate(range.from, 'from');
  const to = assertLocalDate(range.to, 'to');
  const days = dayCount(from, to);
  if (days === 0) {
    throw validationError('A data inicial não pode ser posterior à data final.');
  }
  if (days > maxDays) {
    throw businessRule(`Intervalo excede o limite de ${maxDays} dias.`);
  }
  return { from, to };
}

function dayNumber(localDate: string): number {
  return Math.floor(Date.parse(`${localDate}T00:00:00.000Z`) / 86_400_000);
}

export function dayCount(from: string, to: string): number {
  const count = dayNumber(to) - dayNumber(from) + 1;
  return count > 0 ? count : 0;
}

function dateFromDayNumber(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

/** Desloca uma data local por dias inteiros, sem usar o fuso do servidor. */
export function shiftLocalDate(localDate: string, days: number): string {
  assertLocalDate(localDate);
  if (!Number.isInteger(days)) throw validationError('Deslocamento de data inválido.');
  return dateFromDayNumber(dayNumber(localDate) + days);
}

/** Segunda-feira da semana ISO da data informada. */
export function weekStartFor(localDate: string): string {
  const weekday = new Date(`${localDate}T00:00:00.000Z`).getUTCDay();
  const offset = weekday === 0 ? 6 : weekday - 1;
  return dateFromDayNumber(dayNumber(localDate) - offset);
}

export interface ObservationSample {
  localDate: string;
  valueNum: number;
}

export interface SeriesPoint {
  date: string;
  value: number | null;
  sampleCount: number;
}

/**
 * Série sob demanda: lacunas são `null` explícito, nunca zero. Observações
 * supersedidas já vêm filtradas da consulta; esta função apenas agrega.
 */
export function buildDailySeries(
  samples: readonly ObservationSample[],
  range: DateRange,
  maxDays = MAX_SERIES_DAYS,
): SeriesPoint[] {
  const { from, to } = assertDateRange(range, maxDays);
  const totals = new Map<string, { sum: number; count: number }>();
  for (const sample of samples) {
    assertLocalDate(sample.localDate);
    if (!Number.isFinite(sample.valueNum)) {
      throw businessRule('Observação com valor numérico inválido.');
    }
    if (sample.localDate < from || sample.localDate > to) continue;
    const current = totals.get(sample.localDate) ?? { sum: 0, count: 0 };
    current.sum += sample.valueNum;
    current.count += 1;
    totals.set(sample.localDate, current);
  }

  const points: SeriesPoint[] = [];
  const first = dayNumber(from);
  const last = dayNumber(to);
  for (let day = first; day <= last; day += 1) {
    const date = dateFromDayNumber(day);
    const bucket = totals.get(date);
    points.push({
      date,
      value: bucket === undefined ? null : bucket.sum,
      sampleCount: bucket?.count ?? 0,
    });
  }
  return points;
}

export function buildWeeklySeries(
  samples: readonly ObservationSample[],
  range: DateRange,
  maxDays = MAX_SERIES_DAYS,
): SeriesPoint[] {
  const daily = buildDailySeries(samples, range, maxDays);
  const weeks = new Map<string, { sum: number; count: number; hasData: boolean }>();
  for (const point of daily) {
    const week = weekStartFor(point.date);
    const current = weeks.get(week) ?? { sum: 0, count: 0, hasData: false };
    current.sum += point.value ?? 0;
    current.count += point.sampleCount;
    current.hasData = current.hasData || point.sampleCount > 0;
    weeks.set(week, current);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => ({
      date,
      value: bucket.hasData ? bucket.sum : null,
      sampleCount: bucket.count,
    }));
}

export interface StudySummary {
  totalMinutes: number;
  sessionCount: number;
  daysStudied: number;
  averageMinutes: number | null;
}

export function summarizeStudyMinutes(samples: readonly ObservationSample[]): StudySummary {
  const totalMinutes = samples.reduce((sum, sample) => sum + sample.valueNum, 0);
  const dates = new Set(samples.map((sample) => sample.localDate));
  return {
    totalMinutes,
    sessionCount: samples.length,
    daysStudied: dates.size,
    averageMinutes: samples.length === 0 ? null : totalMinutes / samples.length,
  };
}

export interface CourseMinutesRow {
  courseId: string | null;
  minutes: number;
  sessionCount: number;
}

export type CourseMinutes = CourseMinutesRow;

/**
 * Agrupa minutos já filtrados por período. A soma usa apenas observações ativas
 * devolvidas pela consulta; cursos sem observação não aparecem (não é zero).
 */
export function buildCourseBreakdown(rows: readonly CourseMinutesRow[]): CourseMinutes[] {
  const grouped = new Map<string | null, CourseMinutes>();
  for (const row of rows) {
    if (!Number.isFinite(row.minutes) || row.minutes < 0) {
      throw businessRule('Minutos por curso inválidos.');
    }
    if (!Number.isInteger(row.sessionCount) || row.sessionCount < 0) {
      throw businessRule('Contagem de sessões por curso inválida.');
    }
    const current = grouped.get(row.courseId) ?? {
      courseId: row.courseId,
      minutes: 0,
      sessionCount: 0,
    };
    current.minutes += row.minutes;
    current.sessionCount += row.sessionCount;
    grouped.set(row.courseId, current);
  }
  return [...grouped.values()].sort(
    (a, b) => b.minutes - a.minutes || (a.courseId ?? '').localeCompare(b.courseId ?? ''),
  );
}

export interface MetricDelta {
  current: number;
  previous: number;
  difference: number;
  /** `null` quando a base é zero: variação percentual não é definida. */
  changePercent: number | null;
}

export interface StudyPeriodComparison {
  current: StudySummary;
  previous: StudySummary;
  totalMinutes: MetricDelta;
  sessionCount: MetricDelta;
  daysStudied: MetricDelta;
}

function metricDelta(current: number, previous: number): MetricDelta {
  return {
    current,
    previous,
    difference: current - previous,
    changePercent: previous === 0 ? null : ((current - previous) / previous) * 100,
  };
}

/** Compara dois resumos já calculados; não inventa base quando o período anterior está vazio. */
export function compareStudyPeriods(
  current: StudySummary,
  previous: StudySummary,
): StudyPeriodComparison {
  return {
    current,
    previous,
    totalMinutes: metricDelta(current.totalMinutes, previous.totalMinutes),
    sessionCount: metricDelta(current.sessionCount, previous.sessionCount),
    daysStudied: metricDelta(current.daysStudied, previous.daysStudied),
  };
}

export type GoalProgressMode = 'manual' | 'metrics' | 'tasks' | 'hybrid';
export type GoalMetricDirection = 'increase' | 'decrease' | 'maintain';

export interface GoalMetricProgressInput {
  baselineValue: number | null;
  targetValue: number;
  direction: GoalMetricDirection;
  currentValue: number | null;
  weight?: number | null;
}

export interface GoalProgressInput {
  progressMode: GoalProgressMode;
  manualProgress: number | null;
  metrics: readonly GoalMetricProgressInput[];
  status: 'draft' | 'active' | 'paused' | 'achieved' | 'cancelled';
}

export interface GoalProgress {
  percent: number | null;
  basis: 'manual' | 'metrics' | 'status' | 'unavailable';
  algorithmVersion: string | null;
  achieved: boolean;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

function metricRatio(metric: GoalMetricProgressInput): number | null {
  const { baselineValue, targetValue, currentValue, direction } = metric;
  if (
    currentValue === null ||
    baselineValue === null ||
    !Number.isFinite(currentValue) ||
    !Number.isFinite(baselineValue) ||
    !Number.isFinite(targetValue)
  ) {
    return null;
  }
  if (direction === 'maintain') return null;
  const denominator =
    direction === 'increase' ? targetValue - baselineValue : baselineValue - targetValue;
  if (denominator <= 0) return null;
  const numerator =
    direction === 'increase' ? currentValue - baselineValue : baselineValue - currentValue;
  return clampPercent((numerator / denominator) * 100);
}

/**
 * Progresso de meta a partir de manual ou de razão entre valor atual, baseline e
 * meta. `null` significa "sem dados suficientes", nunca zero.
 */
export function calculateGoalProgress(input: GoalProgressInput): GoalProgress {
  if (input.status === 'achieved') {
    return { percent: 100, basis: 'status', algorithmVersion: null, achieved: true };
  }
  if (input.status === 'cancelled') {
    return { percent: null, basis: 'unavailable', algorithmVersion: null, achieved: false };
  }

  if (input.manualProgress !== null && !Number.isFinite(input.manualProgress)) {
    throw businessRule('Progresso manual inválido.');
  }

  const ratios: { value: number; weight: number }[] = [];
  for (const metric of input.metrics) {
    const value = metricRatio(metric);
    const weight = metric.weight ?? 1;
    if (value === null || !Number.isFinite(weight) || weight <= 0) continue;
    ratios.push({ value, weight });
  }

  if ((input.progressMode === 'metrics' || input.progressMode === 'hybrid') && ratios.length > 0) {
    const totalWeight = ratios.reduce((sum, ratio) => sum + ratio.weight, 0);
    const weighted =
      ratios.reduce((sum, ratio) => sum + ratio.value * ratio.weight, 0) / totalWeight;
    const percent = clampPercent(weighted);
    return {
      percent,
      basis: 'metrics',
      algorithmVersion: GOAL_PROGRESS_ALGORITHM,
      achieved: percent >= 100,
    };
  }

  if (input.progressMode === 'manual' || input.progressMode === 'hybrid') {
    if (input.manualProgress !== null) {
      const percent = clampPercent(input.manualProgress);
      return {
        percent,
        basis: 'manual',
        algorithmVersion: null,
        achieved: percent >= 100,
      };
    }
  }

  return { percent: null, basis: 'unavailable', algorithmVersion: null, achieved: false };
}

/** Cursor opaco de paginação: base64url de `[sortValue, id]`. */
export function encodeCursor(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeCursor(cursor: string): string {
  if (cursor.length === 0 || cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw validationError('Cursor inválido.');
  }
  const padded = cursor.replace(/-/g, '+').replace(/_/g, '/');
  let value: string;
  try {
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    value = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    // `atob` e o TextDecoder fatal lançam erros nativos; a API precisa de um
    // erro de domínio para responder 400 em vez de 500.
    throw validationError('Cursor inválido.');
  }
  const parts = value.split('\u0000');
  if (parts.length !== 2 || parts.some((part) => part.length === 0)) {
    throw validationError('Cursor inválido.');
  }
  return value;
}

export function makeCursor(sortValue: string, id: string): string {
  if (sortValue.includes('\u0000') || id.includes('\u0000')) {
    throw validationError('Valor de cursor inválido.');
  }
  return encodeCursor(`${sortValue}\u0000${id}`);
}

/**
 * Snapshots de auditoria devem refletir o que foi persistido. A chave precisa
 * estar presente mesmo quando o valor é `null`: ausência e null são estados
 * distintos e a comparação com a entidade é obrigatória.
 */
export function assertSnapshotField(
  snapshot: Record<string, unknown>,
  persisted: Record<string, unknown>,
  field: string,
): void {
  if (!Object.prototype.hasOwnProperty.call(snapshot, field)) {
    throw validationError(`Snapshot incompleto: campo ${field} ausente.`);
  }
  const expected = persisted[field] ?? null;
  const actual = snapshot[field] ?? null;
  if (actual !== expected) {
    throw validationError(`Snapshot divergente: campo ${field}.`);
  }
}

export function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function assertResultSize(bodyJson: string): void {
  const size = byteLength(bodyJson);
  if (size > RESULT_BODY_MAX_BYTES) {
    throw businessRule('RESULT_STORE_TOO_LARGE');
  }
}

export function assertOriginalSize(bodyJson: string): void {
  if (byteLength(bodyJson) > ORIGINAL_BODY_MAX_BYTES) {
    throw businessRule('RESPONSE_REPRESENTATION_TOO_LARGE');
  }
}

/** Espelho opcional na chave operacional; o resultado integral fica em `operation_results`. */
export function mirrorFor(bodyJson: string): { mirror: string; bodyOmitted: boolean } {
  if (byteLength(bodyJson) <= MIRROR_BODY_MAX_BYTES) {
    return { mirror: bodyJson, bodyOmitted: false };
  }
  return { mirror: 'null', bodyOmitted: true };
}
