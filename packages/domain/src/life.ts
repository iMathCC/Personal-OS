import { businessRule, validationError } from './errors';
import { dayCount, isLocalDate } from './studies';

/** Cálculos novos são versionados e nunca sobrescrevem os motores existentes. */
export const LIFE_ALGORITHMS = Object.freeze({
  import: 'life-import-dedupe-v1',
  finance: 'finance-summary-v1',
  health: 'health-summary-v1',
  training: 'training-summary-v1',
  reading: 'reading-summary-v1',
  time: 'time-summary-v1',
  integration: 'life-integration-v1',
});

export const LIFE_DOMAINS = [
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
] as const;
export type LifeDomain = (typeof LIFE_DOMAINS)[number];

export const LIFE_ORIGIN_KINDS = [
  'observed',
  'estimated',
  'derived',
  'imported',
  'corrected',
] as const;
export type LifeOriginKind = (typeof LIFE_ORIGIN_KINDS)[number];

export const IMPORT_FORMATS = ['csv', 'json'] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];

export const MAX_IMPORT_BYTES = 12_000;
export const MAX_IMPORT_ROWS = 200;
export const MAX_SERIES_POINTS = 200;
export const MAX_PERIOD_DAYS = 366;

const DANGEROUS_CELL_PREFIX = /^[\s]*[=+\-@\t\r]/;

/* ------------------------------------------------------------ Importação */

export interface CsvRow {
  readonly rowNumber: number;
  readonly cells: readonly string[];
}

export interface CsvParseResult {
  readonly headers: readonly string[];
  readonly rows: readonly CsvRow[];
}

/** CSV determinístico: aspas, vírgulas, CRLF e BOM. Nenhum conteúdo é avaliado. */
export function parseCsv(content: string): CsvParseResult {
  const source = content.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      if (cell.length > 0) throw validationError('CSV inválido: aspas em posição inesperada.');
      quoted = true;
      continue;
    }
    if (char === ',') {
      cells.push(cell);
      cell = '';
      continue;
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      cells.push(cell);
      records.push(cells);
      cells = [];
      cell = '';
      continue;
    }
    cell += char;
  }
  if (quoted) throw validationError('CSV inválido: aspas não fechadas.');
  if (cell.length > 0 || cells.length > 0) {
    cells.push(cell);
    records.push(cells);
  }
  const nonEmpty = records.filter((record) => record.some((value) => value.trim().length > 0));
  const headerRow = nonEmpty[0];
  if (headerRow === undefined) throw validationError('Arquivo vazio.');
  const headers = headerRow.map((value) => value.trim().toLowerCase());
  if (headers.some((value) => value.length === 0))
    throw validationError('CSV sem cabeçalho válido.');
  if (new Set(headers).size !== headers.length) throw validationError('CSV com colunas repetidas.');
  const rows = nonEmpty.slice(1).map((record, offset) => {
    if (record.length !== headers.length) {
      throw validationError(`Linha ${offset + 2} com número de colunas inesperado.`);
    }
    return { rowNumber: offset + 2, cells: record };
  });
  return { headers, rows };
}

export function assertImportLimits(content: string, rowCount: number): void {
  if (new TextEncoder().encode(content).byteLength > MAX_IMPORT_BYTES) {
    throw validationError(`Arquivo acima do limite de ${MAX_IMPORT_BYTES} bytes.`);
  }
  if (rowCount > MAX_IMPORT_ROWS) {
    throw validationError(`Importação limitada a ${MAX_IMPORT_ROWS} registros.`);
  }
}

/** Nunca converte conteúdo externo em fórmula, código ou markup executável. */
export function assertSafeImportCell(value: string): string {
  if (DANGEROUS_CELL_PREFIX.test(value)) {
    throw validationError('Célula com prefixo potencialmente executável rejeitada.');
  }
  return value.trim();
}

/** Hash estável e curto: evita gravar descrições pessoais na chave de dedupe. */
export function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export interface DedupeRecord {
  readonly externalId: string | null;
}

export function dedupeKeyFor(
  domain: LifeDomain,
  fields: Readonly<Record<string, unknown>>,
): string {
  const externalId = fields.externalId;
  if (typeof externalId === 'string' && externalId.length > 0) {
    return `external:${domain}:${externalId}`;
  }
  const part = (key: string) => {
    const value = fields[key];
    return value === null || value === undefined ? '' : String(value);
  };
  switch (domain) {
    case 'finance_transactions':
      return `finance:${part('kind')}:${part('accountId')}:${part('date')}:${part('amountCents')}:${stableHash(part('description'))}`;
    case 'finance_balance_items':
      return `balance:${part('kind')}:${part('name')}:${part('date')}:${part('amountCents')}`;
    case 'finance_accounts':
      return `account:${stableHash(part('name'))}:${part('currency')}`;
    case 'finance_categories':
      return `category:${stableHash(part('name'))}:${part('kind')}`;
    case 'health_metrics':
      return `metric:${part('key')}`;
    case 'health_observations':
      return `health:${part('metricId')}:${part('date')}:${part('value')}`;
    case 'training_sessions':
      return `training:${part('activityType')}:${part('date')}:${part('durationMinutes')}`;
    case 'reading_materials':
      return `material:${stableHash(part('title'))}:${stableHash(part('author'))}`;
    case 'reading_sessions':
      return `reading-session:${part('materialId')}:${part('date')}:${part('minutes')}:${part('pagesRead')}`;
    case 'reading_notes':
      return `reading-note:${part('materialId')}:${part('date')}:${part('kind')}:${stableHash(part('content'))}`;
    case 'time_entries':
      return `time:${part('taskId')}:${part('projectId')}:${part('date')}:${part('durationMinutes')}:${part('startAt')}`;
  }
}

export interface DuplicateMatch<T> {
  readonly record: T;
  readonly matchedBy: 'external_id' | 'domain_criteria';
}

/** Duplicatas nunca são apagadas: são sinalizadas para revisão humana. */
export function findDuplicates<T extends DedupeRecord>(
  incoming: readonly T[],
  existing: readonly T[],
  keyOf: (record: T) => string,
): { unique: T[]; duplicates: DuplicateMatch<T>[] } {
  const seen = new Set(existing.map(keyOf));
  const unique: T[] = [];
  const duplicates: DuplicateMatch<T>[] = [];
  for (const record of incoming) {
    const key = keyOf(record);
    if (seen.has(key)) {
      duplicates.push({
        record,
        matchedBy: record.externalId ? 'external_id' : 'domain_criteria',
      });
    } else {
      seen.add(key);
      unique.push(record);
    }
  }
  return { unique, duplicates };
}

/* ------------------------------------------------------------ Cobertura */

export interface LifeCoverageReport {
  readonly from: string;
  readonly to: string;
  readonly observationCount: number;
  readonly daysWithRecords: number;
  readonly expectedDays: number;
  readonly coverageRatio: number | null;
  readonly limitations: readonly string[];
}

export function coverageReport(
  from: string,
  to: string,
  dates: readonly string[],
  limitation = 'Ausência de registro não significa ausência de atividade.',
): LifeCoverageReport {
  if (!isLocalDate(from) || !isLocalDate(to)) throw validationError('Período inválido.');
  if (to < from) throw validationError('A data final não pode anteceder a inicial.');
  const expectedDays = dayCount(from, to);
  if (expectedDays > MAX_PERIOD_DAYS) {
    throw businessRule(`Período limitado a ${MAX_PERIOD_DAYS} dias.`);
  }
  const inRange = dates.filter((date) => isLocalDate(date) && date >= from && date <= to);
  const daysWithRecords = new Set(inRange).size;
  return {
    from,
    to,
    observationCount: inRange.length,
    daysWithRecords,
    expectedDays,
    coverageRatio: Math.min(1, daysWithRecords / expectedDays),
    limitations: [limitation, 'Cobertura considera apenas registros presentes no período.'],
  };
}

/* ------------------------------------------------------------- Finanças */

export interface FinanceTransactionLike {
  readonly kind: 'income' | 'expense' | 'transfer';
  readonly amountCents: number;
  readonly date: string;
  readonly categoryId: string | null;
}

export interface FinanceBalanceLike {
  readonly kind: 'asset' | 'debt';
  readonly amountCents: number;
  readonly date: string;
}

export interface FinanceSummaryInput {
  readonly from: string;
  readonly to: string;
  readonly transactions: readonly FinanceTransactionLike[];
  readonly balanceItems: readonly FinanceBalanceLike[];
  readonly patrimonyAccountIds: readonly string[];
}

export interface FinanceSummary {
  readonly from: string;
  readonly to: string;
  readonly incomeCents: number;
  readonly expenseCents: number;
  readonly netCents: number;
  readonly transfersExcluded: number;
  readonly byCategory: readonly { categoryId: string; amountCents: number }[];
  readonly cashflow: readonly { date: string; incomeCents: number; expenseCents: number }[];
  readonly patrimonyCents: number | null;
  readonly coverage: LifeCoverageReport;
  readonly limitations: readonly string[];
  readonly algorithmVersion: string;
}

export function assertCents(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw validationError('Valor monetário deve ser inteiro não negativo em centavos.');
  }
  return value;
}

/** Transferências entre contas próprias nunca entram como receita ou despesa. */
export function computeFinanceSummary(input: FinanceSummaryInput): FinanceSummary {
  const inRange = input.transactions.filter(
    (row) => row.date >= input.from && row.date <= input.to,
  );
  let incomeCents = 0;
  let expenseCents = 0;
  let transfersExcluded = 0;
  const categoryTotals = new Map<string, number>();
  const daily = new Map<string, { incomeCents: number; expenseCents: number }>();

  for (const transaction of inRange) {
    assertCents(transaction.amountCents);
    if (transaction.kind === 'transfer') {
      transfersExcluded += 1;
      continue;
    }
    const bucket = daily.get(transaction.date) ?? { incomeCents: 0, expenseCents: 0 };
    if (transaction.kind === 'income') {
      incomeCents += transaction.amountCents;
      bucket.incomeCents += transaction.amountCents;
    } else {
      expenseCents += transaction.amountCents;
      bucket.expenseCents += transaction.amountCents;
      if (transaction.categoryId !== null) {
        categoryTotals.set(
          transaction.categoryId,
          (categoryTotals.get(transaction.categoryId) ?? 0) + transaction.amountCents,
        );
      }
    }
    daily.set(transaction.date, bucket);
  }

  const balances = input.balanceItems.filter(
    (row) => row.date >= input.from && row.date <= input.to,
  );
  // Contas habilitadas sem composição informada não autorizam inventar zero:
  // nesse caso o patrimônio permanece desconhecido.
  const hasPatrimonyInput = balances.length > 0;
  const assetCents = balances
    .filter((row) => row.kind === 'asset')
    .reduce((sum, row) => sum + row.amountCents, 0);
  const debtCents = balances
    .filter((row) => row.kind === 'debt')
    .reduce((sum, row) => sum + row.amountCents, 0);

  return {
    from: input.from,
    to: input.to,
    incomeCents,
    expenseCents,
    netCents: incomeCents - expenseCents,
    transfersExcluded,
    byCategory: [...categoryTotals]
      .map(([categoryId, amountCents]) => ({ categoryId, amountCents }))
      .sort((a, b) => b.amountCents - a.amountCents),
    cashflow: [...daily]
      .map(([date, value]) => ({ date, ...value }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, MAX_SERIES_POINTS),
    patrimonyCents: hasPatrimonyInput ? assetCents - debtCents : null,
    coverage: coverageReport(
      input.from,
      input.to,
      inRange.map((row) => row.date),
    ),
    limitations: [
      'Transferências entre contas próprias são excluídas de receitas e despesas.',
      'Patrimônio é nulo quando não há contas ou componentes informados.',
      ...(balances.length < input.patrimonyAccountIds.length
        ? ['Nem toda conta com patrimônio habilitado possui composição informada no período.']
        : []),
    ],
    algorithmVersion: LIFE_ALGORITHMS.finance,
  };
}

/* -------------------------------------------------------------- Saúde */

export interface HealthObservationLike {
  readonly metricKey: string;
  readonly date: string;
  readonly value: number;
}

export interface HealthSummary {
  readonly metrics: readonly {
    metricKey: string;
    observationCount: number;
    latestValue: number | null;
    latestDate: string | null;
  }[];
  readonly coverage: LifeCoverageReport;
  readonly limitations: readonly string[];
  readonly algorithmVersion: string;
}

/** Somente observações: nenhuma interpretação, diagnóstico ou recomendação. */
export function computeHealthSummary(
  from: string,
  to: string,
  observations: readonly HealthObservationLike[],
): HealthSummary {
  const grouped = new Map<string, HealthObservationLike[]>();
  for (const row of observations) {
    if (row.date < from || row.date > to) continue;
    const bucket = grouped.get(row.metricKey) ?? [];
    bucket.push(row);
    grouped.set(row.metricKey, bucket);
  }
  const metrics = [...grouped]
    .map(([metricKey, rows]) => {
      const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));
      const latest = sorted[0];
      return {
        metricKey,
        observationCount: rows.length,
        latestValue: latest === undefined ? null : latest.value,
        latestDate: latest === undefined ? null : latest.date,
      };
    })
    .sort((a, b) => a.metricKey.localeCompare(b.metricKey));
  return {
    metrics,
    coverage: coverageReport(
      from,
      to,
      observations.map((row) => row.date),
    ),
    limitations: [
      'Registros são observações informadas pelo usuário, não medições clínicas.',
      'Métricas sem observações permanecem desconhecidas.',
    ],
    algorithmVersion: LIFE_ALGORITHMS.health,
  };
}

/* --------------------------------------------------------- Treinamento */

export interface TrainingSessionLike {
  readonly activityType: string;
  readonly date: string;
  readonly durationMinutes: number;
  readonly volume: number | null;
  readonly distanceMeters: number | null;
  readonly intensity: number | null;
}

export interface TrainingSummary {
  readonly sessionCount: number;
  readonly durationMinutes: number;
  readonly volume: number;
  readonly distanceMeters: number;
  readonly byActivity: readonly {
    activityType: string;
    sessionCount: number;
    durationMinutes: number;
    volume: number;
  }[];
  readonly weeksWithRecords: number;
  readonly consistencyRatio: number | null;
  readonly coverage: LifeCoverageReport;
  readonly limitations: readonly string[];
  readonly algorithmVersion: string;
}

export function computeTrainingSummary(
  from: string,
  to: string,
  sessions: readonly TrainingSessionLike[],
): TrainingSummary {
  const inRange = sessions.filter((row) => row.date >= from && row.date <= to);
  const byActivity = new Map<string, TrainingSessionLike[]>();
  for (const row of inRange) {
    const bucket = byActivity.get(row.activityType) ?? [];
    bucket.push(row);
    byActivity.set(row.activityType, bucket);
  }
  const weeks = new Set(inRange.map((row) => weekOf(row.date)));
  const expectedWeeks = Math.max(1, Math.ceil((dayCount(from, to) + 1) / 7));
  return {
    sessionCount: inRange.length,
    durationMinutes: inRange.reduce((sum, row) => sum + row.durationMinutes, 0),
    volume: inRange.reduce((sum, row) => sum + (row.volume ?? 0), 0),
    distanceMeters: inRange.reduce((sum, row) => sum + (row.distanceMeters ?? 0), 0),
    byActivity: [...byActivity]
      .map(([activityType, rows]) => ({
        activityType,
        sessionCount: rows.length,
        durationMinutes: rows.reduce((sum, row) => sum + row.durationMinutes, 0),
        volume: rows.reduce((sum, row) => sum + (row.volume ?? 0), 0),
      }))
      .sort((a, b) => b.sessionCount - a.sessionCount),
    weeksWithRecords: weeks.size,
    consistencyRatio: Math.min(1, weeks.size / expectedWeeks),
    coverage: coverageReport(
      from,
      to,
      inRange.map((row) => row.date),
    ),
    limitations: [
      'Consistência reflete apenas sessões registradas, não frequência real.',
      'Volume e distância ausentes não são considerados zero; ficam fora da soma.',
      'Nenhuma recomendação médica é produzida.',
    ],
    algorithmVersion: LIFE_ALGORITHMS.training,
  };
}

function weekOf(localDate: string): string {
  const day = new Date(`${localDate}T00:00:00.000Z`).getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  const start = new Date(`${localDate}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - offset);
  return start.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------- Leitura */

export interface ReadingMaterialLike {
  readonly id: string;
  readonly status: 'planned' | 'reading' | 'finished' | 'paused';
  readonly totalPages: number | null;
}

export interface ReadingSessionLike {
  readonly materialId: string;
  readonly date: string;
  readonly minutes: number | null;
  readonly pagesRead: number | null;
}

export interface ReadingSummary {
  readonly started: number;
  readonly finished: number;
  readonly minutes: number;
  readonly pagesRead: number;
  readonly progressByMaterial: readonly {
    materialId: string;
    readPages: number;
    totalPages: number | null;
    progressRatio: number | null;
  }[];
  readonly coverage: LifeCoverageReport;
  readonly limitations: readonly string[];
  readonly algorithmVersion: string;
}

export function computeReadingSummary(
  from: string,
  to: string,
  materials: readonly ReadingMaterialLike[],
  sessions: readonly ReadingSessionLike[],
  learningCount: number,
): ReadingSummary {
  const inRange = sessions.filter((row) => row.date >= from && row.date <= to);
  const pages = new Map<string, number>();
  for (const row of inRange) {
    pages.set(row.materialId, (pages.get(row.materialId) ?? 0) + (row.pagesRead ?? 0));
  }
  return {
    started: materials.filter((row) => row.status !== 'planned').length,
    finished: materials.filter((row) => row.status === 'finished').length,
    minutes: inRange.reduce((sum, row) => sum + (row.minutes ?? 0), 0),
    pagesRead: [...pages.values()].reduce((sum, value) => sum + value, 0),
    progressByMaterial: [...pages]
      .map(([materialId, readPages]) => {
        const material = materials.find((row) => row.id === materialId);
        const totalPages = material?.totalPages ?? null;
        return {
          materialId,
          readPages,
          totalPages,
          progressRatio:
            totalPages === null || totalPages <= 0 ? null : Math.min(1, readPages / totalPages),
        };
      })
      .sort((a, b) => a.materialId.localeCompare(b.materialId)),
    coverage: coverageReport(
      from,
      to,
      inRange.map((row) => row.date),
    ),
    limitations: [
      'Progresso é nulo quando o total de páginas não foi informado.',
      `${learningCount} aprendizado(s) registrado(s) não implicam retenção.`,
      'Leitura, estudo estruturado e nota pessoal são conceitos distintos.',
    ],
    algorithmVersion: LIFE_ALGORITHMS.reading,
  };
}

/* ---------------------------------------------------------------- Tempo */

export interface TimeEntryLike {
  readonly id: string;
  readonly date: string;
  readonly durationMinutes: number;
  readonly startAt: string | null;
  readonly endAt: string | null;
  readonly projectId: string | null;
  readonly taskId: string | null;
  readonly areaId: string | null;
}

export interface TimeTaskLike {
  readonly id: string;
  readonly estimateMinutes: number | null;
}

export interface TimeSummary {
  readonly observedMinutes: number;
  readonly estimatedMinutes: number;
  readonly differenceMinutes: number | null;
  readonly byProject: readonly { projectId: string; minutes: number }[];
  readonly byTask: readonly { taskId: string; minutes: number }[];
  readonly byArea: readonly { areaId: string; minutes: number }[];
  readonly overlappingPairs: number;
  readonly duplicateIntervalsIgnored: number;
  readonly coverage: LifeCoverageReport;
  readonly limitations: readonly string[];
  readonly algorithmVersion: string;
}

/** Intervalos idênticos não são somados duas vezes; sobreposições são sinalizadas. */
export function dedupeTimeIntervals(entries: readonly TimeEntryLike[]): {
  unique: TimeEntryLike[];
  duplicatesIgnored: number;
  overlappingPairs: number;
} {
  const seen = new Set<string>();
  const unique: TimeEntryLike[] = [];
  let duplicatesIgnored = 0;
  for (const entry of entries) {
    const key = `${entry.startAt ?? ''}|${entry.endAt ?? ''}|${entry.date}|${entry.durationMinutes}|${entry.taskId ?? ''}|${entry.projectId ?? ''}`;
    if (seen.has(key)) {
      duplicatesIgnored += 1;
      continue;
    }
    seen.add(key);
    unique.push(entry);
  }
  let overlappingPairs = 0;
  for (let left = 0; left < unique.length; left += 1) {
    for (let right = left + 1; right < unique.length; right += 1) {
      const a = unique[left];
      const b = unique[right];
      if (a === undefined || b === undefined) continue;
      if (a.startAt === null || a.endAt === null || b.startAt === null || b.endAt === null)
        continue;
      if (a.startAt < b.endAt && b.startAt < a.endAt) overlappingPairs += 1;
    }
  }
  return { unique, duplicatesIgnored, overlappingPairs };
}

export function computeTimeSummary(
  from: string,
  to: string,
  entries: readonly TimeEntryLike[],
  tasks: readonly TimeTaskLike[],
): TimeSummary {
  const inRange = entries.filter((row) => row.date >= from && row.date <= to);
  const { unique, duplicatesIgnored, overlappingPairs } = dedupeTimeIntervals(inRange);
  const sumBy = (values: readonly (string | null)[]) => {
    const totals = new Map<string, number>();
    for (let index = 0; index < unique.length; index += 1) {
      const id = values[index];
      const entry = unique[index];
      if (id === null || id === undefined || entry === undefined) continue;
      totals.set(id, (totals.get(id) ?? 0) + entry.durationMinutes);
    }
    return [...totals]
      .map(([id, minutes]) => ({ id, minutes }))
      .sort((a, b) => b.minutes - a.minutes);
  };
  const observedMinutes = unique.reduce((sum, row) => sum + row.durationMinutes, 0);
  const comparableTasks = tasks.filter((task) =>
    unique.some((entry) => entry.taskId === task.id && task.estimateMinutes !== null),
  );
  const estimatedMinutes = comparableTasks.reduce(
    (sum, task) => sum + (task.estimateMinutes ?? 0),
    0,
  );
  return {
    observedMinutes,
    estimatedMinutes,
    differenceMinutes: comparableTasks.length > 0 ? observedMinutes - estimatedMinutes : null,
    byProject: sumBy(unique.map((row) => row.projectId)).map((row) => ({
      projectId: row.id,
      minutes: row.minutes,
    })),
    byTask: sumBy(unique.map((row) => row.taskId)).map((row) => ({
      taskId: row.id,
      minutes: row.minutes,
    })),
    byArea: sumBy(unique.map((row) => row.areaId)).map((row) => ({
      areaId: row.id,
      minutes: row.minutes,
    })),
    overlappingPairs,
    duplicateIntervalsIgnored: duplicatesIgnored,
    coverage: coverageReport(
      from,
      to,
      unique.map((row) => row.date),
      'Ausência de registro de tempo não significa ausência de trabalho.',
    ),
    limitations: [
      'Tempo observado é registrado manualmente ou importado; não há rastreamento do sistema.',
      'Estimativa sem registro observado não entra na comparação.',
      'Capacidade configurada não é igual a tempo efetivamente dedicado.',
    ],
    algorithmVersion: LIFE_ALGORITHMS.time,
  };
}

/* --------------------------------------------------------- Integração */

export interface IntegrationRelation {
  readonly id: string;
  readonly sources: readonly string[];
  readonly observationCount: number;
  readonly description: string;
  readonly limitation: string;
}

export interface LifeIntegration {
  readonly from: string;
  readonly to: string;
  readonly sources: readonly string[];
  readonly observationCount: number;
  readonly coverage: LifeCoverageReport;
  readonly relations: readonly IntegrationRelation[];
  readonly limitations: readonly string[];
  readonly algorithmVersion: string;
}

/**
 * Relações explícitas e rastreáveis. Correlação temporal não é afirmada como
 * causalidade, e séries insuficientes não geram tendência.
 */
export function computeLifeIntegration(input: {
  from: string;
  to: string;
  financeObservations: number;
  healthObservations: number;
  trainingObservations: number;
  readingObservations: number;
  timeObservations: number;
  planningSources: readonly string[];
  intelligenceSources: readonly string[];
}): LifeIntegration {
  const observations =
    input.financeObservations +
    input.healthObservations +
    input.trainingObservations +
    input.readingObservations +
    input.timeObservations;
  const sources = [
    ...(input.financeObservations > 0 ? ['finance'] : []),
    ...(input.healthObservations > 0 ? ['health'] : []),
    ...(input.trainingObservations > 0 ? ['training'] : []),
    ...(input.readingObservations > 0 ? ['reading'] : []),
    ...(input.timeObservations > 0 ? ['time'] : []),
    ...input.planningSources,
    ...input.intelligenceSources,
  ];
  const relations: IntegrationRelation[] = [
    {
      id: 'time_vs_planning',
      sources: ['time', 'planning'],
      observationCount: input.timeObservations,
      description:
        'Compara tempo observado com estimativas e capacidade configurada, sem inferir causalidade.',
      limitation: 'Capacidade configurada e tempo observado são grandezas distintas.',
    },
    {
      id: 'reading_vs_goals',
      sources: ['reading', 'goals'],
      observationCount: input.readingObservations,
      description: 'Material de leitura pode estar explicitamente vinculado a uma meta existente.',
      limitation: 'Vínculo explícito não prova contribuição para o resultado da meta.',
    },
    {
      id: 'finance_vs_execution',
      sources: ['finance', 'projects'],
      observationCount: input.financeObservations,
      description: 'Despesas registradas podem ser consultadas por período de execução.',
      limitation: 'Séries independentes não estabelecem relação de causa e efeito.',
    },
  ];
  const baseCoverage = coverageReport(input.from, input.to, []);
  return {
    from: input.from,
    to: input.to,
    sources: [...new Set(sources)],
    observationCount: observations,
    coverage: {
      ...baseCoverage,
      observationCount: observations,
      daysWithRecords: 0,
      coverageRatio: null,
      limitations: [
        'Contagem agregada não permite calcular cobertura diária sem as datas de cada observação.',
        ...baseCoverage.limitations,
      ],
    },
    relations,
    limitations: [
      'Relações são explícitas e rastreáveis; nenhuma causalidade é inferida automaticamente.',
      ...(observations < 3
        ? ['Poucas observações: nenhuma tendência ou projeção é produzida.']
        : []),
    ],
    algorithmVersion: LIFE_ALGORITHMS.integration,
  };
}
