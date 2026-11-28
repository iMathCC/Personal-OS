import { LIFE_ALGORITHMS } from '@personal-os/domain';
import {
  createFinanceAccountSchema,
  createFinanceBalanceItemSchema,
  createFinanceCategorySchema,
  createFinanceTransactionSchema,
  createHealthMetricSchema,
  createHealthObservationSchema,
  createReadingMaterialSchema,
  createReadingNoteSchema,
  createReadingSessionSchema,
  createTimeEntrySchema,
  createTrainingSessionSchema,
  financeAccountDtoSchema,
  financeBalanceItemDtoSchema,
  financeCategoryDtoSchema,
  financeTransactionDtoSchema,
  healthMetricDtoSchema,
  healthObservationDtoSchema,
  readingMaterialDtoSchema,
  readingNoteDtoSchema,
  readingSessionDtoSchema,
  timeEntryDtoSchema,
  trainingSessionDtoSchema,
  updateFinanceAccountSchema,
  updateFinanceBalanceItemSchema,
  updateFinanceCategorySchema,
  updateFinanceTransactionSchema,
  updateHealthMetricSchema,
  updateHealthObservationSchema,
  updateReadingMaterialSchema,
  updateReadingNoteSchema,
  updateReadingSessionSchema,
  updateTimeEntrySchema,
  updateTrainingSessionSchema,
  type LifeDomainDto,
} from '@personal-os/shared';
import type { z } from 'zod';

export type LifeRow = Record<string, unknown>;

export const COMMON_FIELDS = [
  'id',
  'version',
  'source_id',
  'external_id',
  'origin_kind',
  'confidence',
  'algorithm_version',
  'status',
  'superseded_by',
  'corrects_id',
  'created_at',
  'updated_at',
] as const;

export interface LifeAdapter {
  readonly domain: LifeDomainDto;
  readonly path: string;
  readonly table: string;
  readonly label: string;
  readonly entityType: string;
  readonly dateColumn: string | null;
  readonly fields: readonly string[];
  readonly createSchema: z.ZodType;
  readonly updateSchema: z.ZodType;
  readonly importMap: Readonly<Record<string, string>>;
  readonly importBatchColumn?: string;
  readonly toCreateColumns: (input: unknown) => LifeRow;
  readonly toUpdateColumns: (input: unknown) => LifeRow;
  readonly toDto: (row: LifeRow) => unknown;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function commonRow(row: LifeRow): LifeRow {
  return {
    id: String(row.id),
    version: Number(row.version),
    sourceId: String(row.source_id),
    externalId: nullableString(row.external_id),
    originKind: row.origin_kind,
    confidence: nullableNumber(row.confidence),
    algorithmVersion: nullableString(row.algorithm_version),
    status: row.status,
    supersededBy: nullableString(row.superseded_by),
    correctsId: nullableString(row.corrects_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function external(externalId: unknown): LifeRow {
  return { external_id: typeof externalId === 'string' ? externalId : null };
}

function present<T extends object>(target: T, key: keyof T, value: unknown): void {
  if (value !== undefined) {
    Object.assign(target, { [key]: value });
  }
}

const financeAccountsAdapter: LifeAdapter = {
  domain: 'finance_accounts',
  path: 'finance/accounts',
  table: 'finance_accounts',
  label: 'Contas financeiras',
  entityType: 'finance_account',
  dateColumn: null,
  fields: [
    ...COMMON_FIELDS,
    'name',
    'type',
    'currency',
    'initial_balance_cents',
    'include_in_patrimony',
  ],
  createSchema: createFinanceAccountSchema,
  updateSchema: updateFinanceAccountSchema,
  importMap: {
    name: 'name',
    type: 'type',
    currency: 'currency',
    initial_balance_cents: 'initialBalanceCents',
    initial_balance: 'initialBalanceCents',
    include_in_patrimony: 'includeInPatrimony',
    external_id: 'externalId',
  },
  toCreateColumns: (raw) => {
    const input = createFinanceAccountSchema.parse(raw);
    return {
      ...external(input.externalId),
      name: input.name,
      type: input.type ?? 'checking',
      currency: input.currency ?? 'BRL',
      initial_balance_cents: input.initialBalanceCents ?? 0,
      include_in_patrimony: input.includeInPatrimony === false ? 0 : 1,
    };
  },
  toUpdateColumns: (raw) => {
    const input = updateFinanceAccountSchema.parse(raw);
    const output: LifeRow = {};
    present(output, 'name', input.name);
    present(output, 'type', input.type);
    present(output, 'currency', input.currency);
    present(output, 'initial_balance_cents', input.initialBalanceCents);
    present(
      output,
      'include_in_patrimony',
      input.includeInPatrimony === undefined ? undefined : input.includeInPatrimony ? 1 : 0,
    );
    present(output, 'external_id', input.externalId);
    return output;
  },
  toDto: (row) =>
    financeAccountDtoSchema.parse({
      ...commonRow(row),
      name: String(row.name),
      type: row.type,
      currency: String(row.currency),
      initialBalanceCents: Number(row.initial_balance_cents),
      includeInPatrimony: Number(row.include_in_patrimony) === 1,
    }),
};

const financeCategoriesAdapter: LifeAdapter = {
  domain: 'finance_categories',
  path: 'finance/categories',
  table: 'finance_categories',
  label: 'Categorias financeiras',
  entityType: 'finance_category',
  dateColumn: null,
  fields: [...COMMON_FIELDS, 'name', 'kind'],
  createSchema: createFinanceCategorySchema,
  updateSchema: updateFinanceCategorySchema,
  importMap: { name: 'name', kind: 'kind', external_id: 'externalId' },
  toCreateColumns: (raw) => {
    const input = createFinanceCategorySchema.parse(raw);
    return { ...external(input.externalId), name: input.name, kind: input.kind };
  },
  toUpdateColumns: (raw) => {
    const input = updateFinanceCategorySchema.parse(raw);
    const output: LifeRow = {};
    present(output, 'name', input.name);
    present(output, 'kind', input.kind);
    present(output, 'external_id', input.externalId);
    return output;
  },
  toDto: (row) =>
    financeCategoryDtoSchema.parse({
      ...commonRow(row),
      name: String(row.name),
      kind: row.kind,
    }),
};

const financeTransactionsAdapter: LifeAdapter = {
  domain: 'finance_transactions',
  path: 'finance/transactions',
  table: 'finance_transactions',
  label: 'Transações',
  entityType: 'finance_transaction',
  dateColumn: 'date',
  fields: [
    ...COMMON_FIELDS,
    'account_id',
    'category_id',
    'kind',
    'amount_cents',
    'currency',
    'date',
    'description',
    'notes',
    'transfer_pair_id',
    'import_batch_id',
  ],
  createSchema: createFinanceTransactionSchema,
  updateSchema: updateFinanceTransactionSchema,
  importMap: {
    account_id: 'accountId',
    conta: 'accountId',
    category_id: 'categoryId',
    categoria: 'categoryId',
    kind: 'kind',
    tipo: 'kind',
    amount_cents: 'amountCents',
    valor_centavos: 'amountCents',
    amount: 'amountCents',
    currency: 'currency',
    moeda: 'currency',
    date: 'date',
    data: 'date',
    description: 'description',
    descricao: 'description',
    notes: 'notes',
    observacoes: 'notes',
    transfer_pair_id: 'transferPairId',
    external_id: 'externalId',
  },
  importBatchColumn: 'import_batch_id',
  toCreateColumns: (raw) => {
    const input = createFinanceTransactionSchema.parse(raw);
    return {
      ...external(input.externalId),
      account_id: input.accountId,
      category_id: input.categoryId ?? null,
      kind: input.kind,
      amount_cents: input.amountCents,
      currency: input.currency ?? 'BRL',
      date: input.date,
      description: input.description,
      notes: input.notes ?? null,
      transfer_pair_id: input.transferPairId ?? null,
    };
  },
  toUpdateColumns: (raw) => {
    const input = updateFinanceTransactionSchema.parse(raw);
    const output: LifeRow = {};
    present(output, 'account_id', input.accountId);
    present(output, 'category_id', input.categoryId);
    present(output, 'kind', input.kind);
    present(output, 'amount_cents', input.amountCents);
    present(output, 'currency', input.currency);
    present(output, 'date', input.date);
    present(output, 'description', input.description);
    present(output, 'notes', input.notes);
    present(output, 'transfer_pair_id', input.transferPairId);
    present(output, 'external_id', input.externalId);
    return output;
  },
  toDto: (row) =>
    financeTransactionDtoSchema.parse({
      ...commonRow(row),
      accountId: String(row.account_id),
      categoryId: nullableString(row.category_id),
      kind: row.kind,
      amountCents: Number(row.amount_cents),
      currency: String(row.currency),
      date: String(row.date),
      description: String(row.description),
      notes: nullableString(row.notes),
      transferPairId: nullableString(row.transfer_pair_id),
      importBatchId: nullableString(row.import_batch_id),
    }),
};

const financeBalanceItemsAdapter: LifeAdapter = {
  domain: 'finance_balance_items',
  path: 'finance/balance',
  table: 'finance_balance_items',
  label: 'Patrimônio e dívidas',
  entityType: 'finance_balance_item',
  dateColumn: 'date',
  fields: [
    ...COMMON_FIELDS,
    'kind',
    'account_id',
    'name',
    'amount_cents',
    'currency',
    'date',
    'import_batch_id',
  ],
  createSchema: createFinanceBalanceItemSchema,
  updateSchema: updateFinanceBalanceItemSchema,
  importMap: {
    kind: 'kind',
    tipo: 'kind',
    account_id: 'accountId',
    name: 'name',
    nome: 'name',
    amount_cents: 'amountCents',
    amount: 'amountCents',
    currency: 'currency',
    date: 'date',
    data: 'date',
    external_id: 'externalId',
  },
  importBatchColumn: 'import_batch_id',
  toCreateColumns: (raw) => {
    const input = createFinanceBalanceItemSchema.parse(raw);
    return {
      ...external(input.externalId),
      kind: input.kind,
      account_id: input.accountId ?? null,
      name: input.name,
      amount_cents: input.amountCents,
      currency: input.currency ?? 'BRL',
      date: input.date,
    };
  },
  toUpdateColumns: (raw) => {
    const input = updateFinanceBalanceItemSchema.parse(raw);
    const output: LifeRow = {};
    present(output, 'kind', input.kind);
    present(output, 'account_id', input.accountId);
    present(output, 'name', input.name);
    present(output, 'amount_cents', input.amountCents);
    present(output, 'currency', input.currency);
    present(output, 'date', input.date);
    present(output, 'external_id', input.externalId);
    return output;
  },
  toDto: (row) =>
    financeBalanceItemDtoSchema.parse({
      ...commonRow(row),
      kind: row.kind,
      accountId: nullableString(row.account_id),
      name: String(row.name),
      amountCents: Number(row.amount_cents),
      currency: String(row.currency),
      date: String(row.date),
      importBatchId: nullableString(row.import_batch_id),
    }),
};

const healthMetricsAdapter: LifeAdapter = {
  domain: 'health_metrics',
  path: 'health/metrics',
  table: 'health_metrics',
  label: 'Métricas de saúde',
  entityType: 'health_metric',
  dateColumn: null,
  fields: [...COMMON_FIELDS, 'key', 'label', 'unit', 'value_kind'],
  createSchema: createHealthMetricSchema,
  updateSchema: updateHealthMetricSchema,
  importMap: {
    key: 'key',
    label: 'label',
    unit: 'unit',
    value_kind: 'valueKind',
    external_id: 'externalId',
  },
  toCreateColumns: (raw) => {
    const input = createHealthMetricSchema.parse(raw);
    return {
      ...external(input.externalId),
      key: input.key,
      label: input.label,
      unit: input.unit,
      value_kind: input.valueKind ?? 'integer',
    };
  },
  toUpdateColumns: (raw) => {
    const input = updateHealthMetricSchema.parse(raw);
    const output: LifeRow = {};
    present(output, 'key', input.key);
    present(output, 'label', input.label);
    present(output, 'unit', input.unit);
    present(output, 'value_kind', input.valueKind);
    present(output, 'external_id', input.externalId);
    return output;
  },
  toDto: (row) =>
    healthMetricDtoSchema.parse({
      ...commonRow(row),
      key: String(row.key),
      label: String(row.label),
      unit: String(row.unit),
      valueKind: row.value_kind,
    }),
};

const healthObservationsAdapter: LifeAdapter = {
  domain: 'health_observations',
  path: 'health/observations',
  table: 'health_observations',
  label: 'Observações de saúde',
  entityType: 'health_observation',
  dateColumn: 'date',
  fields: [...COMMON_FIELDS, 'metric_id', 'date', 'value', 'note'],
  createSchema: createHealthObservationSchema,
  updateSchema: updateHealthObservationSchema,
  importMap: {
    metric_id: 'metricId',
    metrica: 'metricId',
    date: 'date',
    data: 'date',
    value: 'value',
    valor: 'value',
    note: 'note',
    observacao: 'note',
    external_id: 'externalId',
  },
  toCreateColumns: (raw) => {
    const input = createHealthObservationSchema.parse(raw);
    return {
      ...external(input.externalId),
      metric_id: input.metricId,
      date: input.date,
      value: input.value,
      note: input.note ?? null,
    };
  },
  toUpdateColumns: (raw) => {
    const input = updateHealthObservationSchema.parse(raw);
    const output: LifeRow = {};
    present(output, 'metric_id', input.metricId);
    present(output, 'date', input.date);
    present(output, 'value', input.value);
    present(output, 'note', input.note);
    present(output, 'external_id', input.externalId);
    return output;
  },
  toDto: (row) =>
    healthObservationDtoSchema.parse({
      ...commonRow(row),
      metricId: String(row.metric_id),
      date: String(row.date),
      value: Number(row.value),
      note: nullableString(row.note),
    }),
};

const trainingSessionsAdapter: LifeAdapter = {
  domain: 'training_sessions',
  path: 'training/sessions',
  table: 'training_sessions',
  label: 'Sessões de treinamento',
  entityType: 'training_session',
  dateColumn: 'date',
  fields: [
    ...COMMON_FIELDS,
    'activity_type',
    'date',
    'duration_minutes',
    'volume',
    'distance_meters',
    'intensity',
    'note',
  ],
  createSchema: createTrainingSessionSchema,
  updateSchema: updateTrainingSessionSchema,
  importMap: {
    activity_type: 'activityType',
    atividade: 'activityType',
    date: 'date',
    data: 'date',
    duration_minutes: 'durationMinutes',
    duracao: 'durationMinutes',
    volume: 'volume',
    distance_meters: 'distanceMeters',
    distancia: 'distanceMeters',
    intensity: 'intensity',
    intensidade: 'intensity',
    note: 'note',
    observacao: 'note',
    external_id: 'externalId',
  },
  toCreateColumns: (raw) => {
    const input = createTrainingSessionSchema.parse(raw);
    return {
      ...external(input.externalId),
      activity_type: input.activityType,
      date: input.date,
      duration_minutes: input.durationMinutes,
      volume: input.volume ?? null,
      distance_meters: input.distanceMeters ?? null,
      intensity: input.intensity ?? null,
      note: input.note ?? null,
    };
  },
  toUpdateColumns: (raw) => {
    const input = updateTrainingSessionSchema.parse(raw);
    const output: LifeRow = {};
    present(output, 'activity_type', input.activityType);
    present(output, 'date', input.date);
    present(output, 'duration_minutes', input.durationMinutes);
    present(output, 'volume', input.volume);
    present(output, 'distance_meters', input.distanceMeters);
    present(output, 'intensity', input.intensity);
    present(output, 'note', input.note);
    present(output, 'external_id', input.externalId);
    return output;
  },
  toDto: (row) =>
    trainingSessionDtoSchema.parse({
      ...commonRow(row),
      activityType: String(row.activity_type),
      date: String(row.date),
      durationMinutes: Number(row.duration_minutes),
      volume: nullableNumber(row.volume),
      distanceMeters: nullableNumber(row.distance_meters),
      intensity: nullableNumber(row.intensity),
      note: nullableString(row.note),
    }),
};

const readingMaterialsAdapter: LifeAdapter = {
  domain: 'reading_materials',
  path: 'reading/materials',
  table: 'reading_materials',
  label: 'Materiais de leitura',
  entityType: 'reading_material',
  dateColumn: null,
  fields: [
    ...COMMON_FIELDS,
    'title',
    'author',
    'kind',
    'reading_status',
    'total_pages',
    'goal_id',
    'course_id',
  ],
  createSchema: createReadingMaterialSchema,
  updateSchema: updateReadingMaterialSchema,
  importMap: {
    title: 'title',
    titulo: 'title',
    author: 'author',
    autor: 'author',
    kind: 'kind',
    status: 'status',
    total_pages: 'totalPages',
    paginas: 'totalPages',
    goal_id: 'goalId',
    meta: 'goalId',
    course_id: 'courseId',
    external_id: 'externalId',
  },
  toCreateColumns: (raw) => {
    const input = createReadingMaterialSchema.parse(raw);
    return {
      ...external(input.externalId),
      title: input.title,
      author: input.author ?? null,
      kind: input.kind ?? 'book',
      reading_status: input.status ?? 'planned',
      total_pages: input.totalPages ?? null,
      goal_id: input.goalId ?? null,
      course_id: input.courseId ?? null,
    };
  },
  toUpdateColumns: (raw) => {
    const input = updateReadingMaterialSchema.parse(raw);
    const output: LifeRow = {};
    present(output, 'title', input.title);
    present(output, 'author', input.author);
    present(output, 'kind', input.kind);
    present(output, 'reading_status', input.status);
    present(output, 'total_pages', input.totalPages);
    present(output, 'goal_id', input.goalId);
    present(output, 'course_id', input.courseId);
    present(output, 'external_id', input.externalId);
    return output;
  },
  toDto: (row) =>
    readingMaterialDtoSchema.parse({
      ...commonRow(row),
      title: String(row.title),
      author: nullableString(row.author),
      kind: row.kind,
      status: row.reading_status,
      totalPages: nullableNumber(row.total_pages),
      goalId: nullableString(row.goal_id),
      courseId: nullableString(row.course_id),
    }),
};

const readingSessionsAdapter: LifeAdapter = {
  domain: 'reading_sessions',
  path: 'reading/sessions',
  table: 'reading_sessions',
  label: 'Sessões de leitura',
  entityType: 'reading_session',
  dateColumn: 'date',
  fields: [...COMMON_FIELDS, 'material_id', 'date', 'minutes', 'pages_read', 'note'],
  createSchema: createReadingSessionSchema,
  updateSchema: updateReadingSessionSchema,
  importMap: {
    material_id: 'materialId',
    material: 'materialId',
    date: 'date',
    data: 'date',
    minutes: 'minutes',
    minutos: 'minutes',
    pages_read: 'pagesRead',
    paginas: 'pagesRead',
    note: 'note',
    observacao: 'note',
    external_id: 'externalId',
  },
  toCreateColumns: (raw) => {
    const input = createReadingSessionSchema.parse(raw);
    return {
      ...external(input.externalId),
      material_id: input.materialId,
      date: input.date,
      minutes: input.minutes ?? null,
      pages_read: input.pagesRead ?? null,
      note: input.note ?? null,
    };
  },
  toUpdateColumns: (raw) => {
    const input = updateReadingSessionSchema.parse(raw);
    const output: LifeRow = {};
    present(output, 'material_id', input.materialId);
    present(output, 'date', input.date);
    present(output, 'minutes', input.minutes);
    present(output, 'pages_read', input.pagesRead);
    present(output, 'note', input.note);
    present(output, 'external_id', input.externalId);
    return output;
  },
  toDto: (row) =>
    readingSessionDtoSchema.parse({
      ...commonRow(row),
      materialId: String(row.material_id),
      date: String(row.date),
      minutes: nullableNumber(row.minutes),
      pagesRead: nullableNumber(row.pages_read),
      note: nullableString(row.note),
    }),
};

const readingNotesAdapter: LifeAdapter = {
  domain: 'reading_notes',
  path: 'reading/notes',
  table: 'reading_notes',
  label: 'Notas e aprendizados',
  entityType: 'reading_note',
  dateColumn: 'date',
  fields: [...COMMON_FIELDS, 'material_id', 'date', 'kind', 'content'],
  createSchema: createReadingNoteSchema,
  updateSchema: updateReadingNoteSchema,
  importMap: {
    material_id: 'materialId',
    material: 'materialId',
    date: 'date',
    data: 'date',
    kind: 'kind',
    content: 'content',
    conteudo: 'content',
    external_id: 'externalId',
  },
  toCreateColumns: (raw) => {
    const input = createReadingNoteSchema.parse(raw);
    return {
      ...external(input.externalId),
      material_id: input.materialId,
      date: input.date,
      kind: input.kind ?? 'note',
      content: input.content,
    };
  },
  toUpdateColumns: (raw) => {
    const input = updateReadingNoteSchema.parse(raw);
    const output: LifeRow = {};
    present(output, 'material_id', input.materialId);
    present(output, 'date', input.date);
    present(output, 'kind', input.kind);
    present(output, 'content', input.content);
    present(output, 'external_id', input.externalId);
    return output;
  },
  toDto: (row) =>
    readingNoteDtoSchema.parse({
      ...commonRow(row),
      materialId: String(row.material_id),
      date: String(row.date),
      kind: row.kind,
      content: String(row.content),
    }),
};

const timeEntriesAdapter: LifeAdapter = {
  domain: 'time_entries',
  path: 'time/entries',
  table: 'time_entries',
  label: 'Registros de tempo',
  entityType: 'time_entry',
  dateColumn: 'date',
  fields: [
    ...COMMON_FIELDS,
    'task_id',
    'project_id',
    'area_id',
    'date',
    'start_at',
    'end_at',
    'duration_minutes',
    'note',
    'import_batch_id',
  ],
  createSchema: createTimeEntrySchema,
  updateSchema: updateTimeEntrySchema,
  importMap: {
    task_id: 'taskId',
    tarefa: 'taskId',
    project_id: 'projectId',
    projeto: 'projectId',
    area_id: 'areaId',
    area: 'areaId',
    date: 'date',
    data: 'date',
    start_at: 'startAt',
    inicio: 'startAt',
    end_at: 'endAt',
    fim: 'endAt',
    duration_minutes: 'durationMinutes',
    duracao: 'durationMinutes',
    note: 'note',
    observacao: 'note',
    external_id: 'externalId',
  },
  importBatchColumn: 'import_batch_id',
  toCreateColumns: (raw) => {
    const input = createTimeEntrySchema.parse(raw);
    const duration =
      input.durationMinutes ??
      (input.startAt !== undefined && input.endAt !== undefined
        ? Math.round((Date.parse(input.endAt ?? '') - Date.parse(input.startAt ?? '')) / 60_000)
        : 0);
    return {
      ...external(input.externalId),
      task_id: input.taskId ?? null,
      project_id: input.projectId ?? null,
      area_id: input.areaId ?? null,
      date: input.date,
      start_at: input.startAt ?? null,
      end_at: input.endAt ?? null,
      duration_minutes: duration,
      note: input.note ?? null,
    };
  },
  toUpdateColumns: (raw) => {
    const input = updateTimeEntrySchema.parse(raw);
    const output: LifeRow = {};
    present(output, 'task_id', input.taskId);
    present(output, 'project_id', input.projectId);
    present(output, 'area_id', input.areaId);
    present(output, 'date', input.date);
    present(output, 'start_at', input.startAt);
    present(output, 'end_at', input.endAt);
    present(output, 'duration_minutes', input.durationMinutes);
    present(output, 'note', input.note);
    present(output, 'external_id', input.externalId);
    return output;
  },
  toDto: (row) =>
    timeEntryDtoSchema.parse({
      ...commonRow(row),
      taskId: nullableString(row.task_id),
      projectId: nullableString(row.project_id),
      areaId: nullableString(row.area_id),
      date: String(row.date),
      startAt: nullableString(row.start_at),
      endAt: nullableString(row.end_at),
      durationMinutes: Number(row.duration_minutes),
      note: nullableString(row.note),
      importBatchId: nullableString(row.import_batch_id),
    }),
};

export const LIFE_ADAPTERS: readonly LifeAdapter[] = [
  financeAccountsAdapter,
  financeCategoriesAdapter,
  financeTransactionsAdapter,
  financeBalanceItemsAdapter,
  healthMetricsAdapter,
  healthObservationsAdapter,
  trainingSessionsAdapter,
  readingMaterialsAdapter,
  readingSessionsAdapter,
  readingNotesAdapter,
  timeEntriesAdapter,
];

export function adapterFor(domain: LifeDomainDto): LifeAdapter {
  const adapter = LIFE_ADAPTERS.find((item) => item.domain === domain);
  if (adapter === undefined) throw new Error(`Adaptador de domínio ausente: ${domain}`);
  return adapter;
}

export function originForImport(): { originKind: string; sourceId: string } {
  return {
    originKind: 'imported',
    sourceId: 'src_import',
  };
}

export function algorithmVersionFor(domain: LifeDomainDto): string {
  if (domain.startsWith('finance')) return LIFE_ALGORITHMS.finance;
  if (domain.startsWith('health')) return LIFE_ALGORITHMS.health;
  if (domain.startsWith('training')) return LIFE_ALGORITHMS.training;
  if (domain.startsWith('reading')) return LIFE_ALGORITHMS.reading;
  return LIFE_ALGORITHMS.time;
}
