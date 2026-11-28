import { sql, type SQL } from 'drizzle-orm';
import { auditStatement, newId, type Database } from '@personal-os/db';
import {
  assertImportLimits,
  assertSafeImportCell,
  computeFinanceSummary,
  computeHealthSummary,
  computeLifeIntegration,
  computeReadingSummary,
  computeTimeSummary,
  computeTrainingSummary,
  decodeCursor,
  dedupeKeyFor,
  LIFE_ALGORITHMS,
  makeCursor,
  parseCsv,
  conflict,
  notFound,
  validationError,
} from '@personal-os/domain';
import {
  financeSummaryDtoSchema,
  healthSummaryDtoSchema,
  importPreviewDtoSchema,
  lifeDashboardDtoSchema,
  lifeIntegrationDtoSchema,
  readingSummaryDtoSchema,
  timeSummaryDtoSchema,
  trainingSummaryDtoSchema,
  type ImportIssueDto,
  type ImportPreviewDto,
  type LifeDomainDto,
  type LifePeriodQuery,
} from '@personal-os/shared';
import { executeIdempotent, type IdempotentResult } from '../operations/idempotency';
import { envelope, type MutatingRequest } from '../goals/service';
import {
  adapterFor,
  algorithmVersionFor,
  LIFE_ADAPTERS,
  originForImport,
  type LifeAdapter,
  type LifeRow,
} from './adapters';

const READ_LIMIT = 200;
const MANUAL_SOURCE_ID = 'src_manual';
const IMPORT_SOURCE_ID = 'src_import';

export interface LifeContext {
  db: Database;
  requestId: string;
  subject: string;
  ipHash: string | null;
  now: string;
  timezone: string;
}

interface ParsedImportRow {
  readonly row: number;
  readonly record: LifeRow;
  readonly key: string;
  readonly externalId: string | null;
  readonly valid: boolean;
  readonly issues: ImportIssueDto[];
}

type AuditAction = 'create' | 'update' | 'delete';

function identifier(value: string): SQL {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw validationError('Identificador de coluna inválido.');
  return sql.raw(`"${value}"`);
}

function mutationContext(ctx: LifeContext, request: MutatingRequest) {
  return {
    db: ctx.db,
    subject: ctx.subject,
    method: request.method,
    path: request.path,
    query: request.query,
    clientKey: request.clientKey,
    rawBody: request.rawBody,
    now: ctx.now,
  };
}

function audit(
  ctx: LifeContext,
  entityType: string,
  entityId: string,
  action: AuditAction,
  meta: LifeRow,
): SQL {
  return auditStatement({
    entityType,
    entityId,
    action,
    actorType: 'user',
    actorId: ctx.subject,
    afterJson: JSON.stringify(meta),
    requestId: ctx.requestId,
    ipHash: ctx.ipHash,
  });
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function commonInsertValues(ctx: LifeContext, opId: string, imported: boolean): LifeRow {
  const origin = imported
    ? originForImport()
    : { originKind: 'observed', sourceId: MANUAL_SOURCE_ID };
  return {
    source_id: origin.sourceId,
    origin_kind: origin.originKind,
    confidence: null,
    algorithm_version: null,
    status: 'active',
    version: 1,
    created_operation_id: opId,
    updated_operation_id: opId,
    created_at: ctx.now,
    updated_at: ctx.now,
  };
}

function insertStatement(table: string, values: LifeRow): SQL {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  const columns = sql.join(
    entries.map(([key]) => identifier(key)),
    sql`, `,
  );
  const params = sql.join(
    entries.map(([, value]) => sql`${value ?? null}`),
    sql`, `,
  );
  return sql`INSERT INTO ${identifier(table)} (${columns}) VALUES (${params})`;
}

function updateStatement(table: string, values: LifeRow, id: string): SQL {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  if (entries.length === 0) throw validationError('Nenhum campo informado.');
  const assignments = sql.join(
    entries.map(([key, value]) => sql`${identifier(key)} = ${value ?? null}`),
    sql`, `,
  );
  return sql`UPDATE ${identifier(table)} SET ${assignments} WHERE ${identifier('id')} = ${id}`;
}

interface ListOptions {
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
  readonly cursor?: string;
  readonly history?: boolean;
}

async function selectRows(
  ctx: LifeContext,
  adapter: LifeAdapter,
  options: ListOptions = {},
): Promise<{ rows: LifeRow[]; truncated: boolean }> {
  const limit = Math.min(READ_LIMIT, options.limit ?? 50);
  const conditions: SQL[] = [];
  if (options.history !== true) conditions.push(sql`${identifier('status')} = 'active'`);
  if (adapter.dateColumn !== null) {
    if (options.from !== undefined) {
      conditions.push(sql`${identifier(adapter.dateColumn)} >= ${options.from}`);
    }
    if (options.to !== undefined) {
      conditions.push(sql`${identifier(adapter.dateColumn)} <= ${options.to}`);
    }
  }
  const sortColumn = adapter.dateColumn ?? 'created_at';
  if (options.cursor !== undefined) {
    const parts = decodeCursor(options.cursor).split('\u0000');
    const sortValue = parts[0];
    const cursorId = parts[1];
    if (
      parts.length !== 2 ||
      sortValue === undefined ||
      cursorId === undefined ||
      sortValue.length === 0 ||
      cursorId.length === 0
    ) {
      throw validationError('Cursor inválido.');
    }
    conditions.push(
      sql`(${identifier(sortColumn)} < ${sortValue} OR (${identifier(sortColumn)} = ${sortValue} AND ${identifier('id')} < ${cursorId}))`,
    );
  }
  const where = conditions.length === 0 ? sql`` : sql`WHERE ${sql.join(conditions, sql` AND `)}`;
  const columns = sql.join(adapter.fields.map(identifier), sql`, `);
  const rows = (await ctx.db.all(sql`
    SELECT ${columns} FROM ${identifier(adapter.table)}
    ${where}
    ORDER BY ${identifier(sortColumn)} DESC, ${identifier('id')} DESC
    LIMIT ${limit + 1}
  `)) as LifeRow[];
  return { rows: rows.slice(0, limit), truncated: rows.length > limit };
}

export interface RecordPage {
  readonly items: unknown[];
  readonly nextCursor: string | null;
  readonly truncated: boolean;
}

export async function listRecords(
  ctx: LifeContext,
  domain: LifeDomainDto,
  query: LifePeriodQuery,
): Promise<RecordPage> {
  const adapter = adapterFor(domain);
  const { rows, truncated } = await selectRows(ctx, adapter, query);
  const items = rows.map((row) => adapter.toDto(row));
  const last = rows[rows.length - 1];
  const sortValue = adapter.dateColumn === null ? last?.created_at : last?.[adapter.dateColumn];
  return {
    items,
    nextCursor:
      truncated && last !== undefined && sortValue !== undefined
        ? makeCursor(String(sortValue), String(last.id))
        : null,
    truncated,
  };
}

export async function listHistory(
  ctx: LifeContext,
  domain: LifeDomainDto,
  limit: number,
  cursor?: string,
): Promise<RecordPage> {
  const adapter = adapterFor(domain);
  const { rows, truncated } = await selectRows(ctx, adapter, { limit, cursor, history: true });
  const items = rows.map((row) => adapter.toDto(row));
  const last = rows[rows.length - 1];
  const sortValue = adapter.dateColumn === null ? last?.created_at : last?.[adapter.dateColumn];
  return {
    items,
    nextCursor:
      truncated && last !== undefined && sortValue !== undefined
        ? makeCursor(String(sortValue), String(last.id))
        : null,
    truncated,
  };
}

async function rowById(ctx: LifeContext, adapter: LifeAdapter, id: string): Promise<LifeRow> {
  const columns = sql.join(adapter.fields.map(identifier), sql`, `);
  const rows = (await ctx.db.all(sql`
    SELECT ${columns} FROM ${identifier(adapter.table)}
    WHERE ${identifier('id')} = ${id} LIMIT 1
  `)) as LifeRow[];
  const row = rows[0];
  if (row === undefined) throw notFound('Registro não encontrado.');
  return row;
}

async function assertExists(
  ctx: LifeContext,
  table: string,
  ids: readonly string[],
  message: string,
): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const rows = (await ctx.db.all(sql`
    SELECT ${identifier('id')} FROM ${identifier(table)}
    WHERE ${identifier('id')} IN (${sql.join(
      unique.map((id) => sql`${id}`),
      sql`, `,
    )})
    LIMIT ${unique.length}
  `)) as { id: string }[];
  if (rows.length !== unique.length) throw notFound(message);
}

async function assertRelations(
  ctx: LifeContext,
  adapter: LifeAdapter,
  input: LifeRow,
): Promise<void> {
  const stringField = (key: string): string | null => {
    const snake = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    return nullableString(input[key] ?? input[snake]);
  };
  switch (adapter.domain) {
    case 'finance_transactions':
      await assertExists(
        ctx,
        'finance_accounts',
        [stringField('accountId') ?? ''],
        'Conta inexistente.',
      );
      if (stringField('categoryId') !== null) {
        await assertExists(
          ctx,
          'finance_categories',
          [stringField('categoryId') ?? ''],
          'Categoria inexistente.',
        );
      }
      if (stringField('transferPairId') !== null) {
        await assertExists(
          ctx,
          'finance_transactions',
          [stringField('transferPairId') ?? ''],
          'Transferência pareada inexistente.',
        );
      }
      if (stringField('kind') !== 'transfer' && stringField('categoryId') !== null) {
        // Categoria informada é válida para receita/despesa.
      }
      break;
    case 'finance_balance_items':
      if (stringField('accountId') !== null) {
        await assertExists(
          ctx,
          'finance_accounts',
          [stringField('accountId') ?? ''],
          'Conta inexistente.',
        );
      }
      break;
    case 'health_observations':
      await assertExists(
        ctx,
        'health_metrics',
        [stringField('metricId') ?? ''],
        'Métrica inexistente.',
      );
      break;
    case 'reading_materials':
      if (stringField('goalId') !== null) {
        await assertExists(ctx, 'goals', [stringField('goalId') ?? ''], 'Meta inexistente.');
      }
      if (stringField('courseId') !== null) {
        await assertExists(ctx, 'courses', [stringField('courseId') ?? ''], 'Curso inexistente.');
      }
      break;
    case 'reading_sessions':
    case 'reading_notes':
      await assertExists(
        ctx,
        'reading_materials',
        [stringField('materialId') ?? ''],
        'Material inexistente.',
      );
      break;
    case 'time_entries':
      if (stringField('taskId') !== null) {
        await assertExists(ctx, 'tasks', [stringField('taskId') ?? ''], 'Tarefa inexistente.');
      }
      if (stringField('projectId') !== null) {
        await assertExists(
          ctx,
          'projects',
          [stringField('projectId') ?? ''],
          'Projeto inexistente.',
        );
      }
      if (stringField('areaId') !== null) {
        await assertExists(ctx, 'areas', [stringField('areaId') ?? ''], 'Área inexistente.');
      }
      break;
    default:
      break;
  }
}

export async function createRecord(
  ctx: LifeContext,
  request: MutatingRequest,
  domain: LifeDomainDto,
  input: unknown,
): Promise<IdempotentResult> {
  const adapter = adapterFor(domain);
  const parsed = adapter.createSchema.parse(input);
  const columns = adapter.toCreateColumns(parsed);
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        await assertRelations(ctx, adapter, { ...columns, ...(parsed as LifeRow) });
      },
    },
    ({ opId }) => {
      const id = newId();
      const values = {
        id,
        ...commonInsertValues(ctx, opId, false),
        ...columns,
        algorithm_version: algorithmVersionFor(domain),
      };
      return {
        status: 201 as const,
        bodyJson: envelope(ctx.requestId, adapter.toDto(values)),
        statements: [
          insertStatement(adapter.table, values),
          audit(ctx, adapter.entityType, id, 'create', {
            id,
            version: 1,
            sourceId: MANUAL_SOURCE_ID,
            originKind: 'observed',
            status: 'active',
          }),
        ],
      };
    },
  );
}

export async function correctRecord(
  ctx: LifeContext,
  request: MutatingRequest,
  domain: LifeDomainDto,
  id: string,
  input: unknown,
  expectedVersion?: number,
): Promise<IdempotentResult> {
  const adapter = adapterFor(domain);
  const parsed = adapter.updateSchema.parse(input);
  const changes = adapter.toUpdateColumns(parsed);
  let current: LifeRow | undefined;

  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        current = await rowById(ctx, adapter, id);
        if (expectedVersion === undefined || expectedVersion !== Number(current.version)) {
          throw conflict('Versão do registro divergente.');
        }
        if (current.status !== 'active') throw conflict('Registro não está ativo.');
        await assertRelations(ctx, adapter, { ...current, ...changes });
      },
    },
    ({ opId }) => {
      if (current === undefined) throw conflict('Registro não disponível para correção.');
      const previous = current;
      const correctedId = newId();
      const corrected: LifeRow = {
        ...previous,
        ...changes,
        id: correctedId,
        version: Number(previous.version) + 1,
        status: 'active',
        superseded_by: null,
        corrects_id: id,
        source_id: MANUAL_SOURCE_ID,
        origin_kind: 'corrected',
        confidence: null,
        algorithm_version: null,
        created_operation_id: opId,
        updated_operation_id: opId,
        created_at: ctx.now,
        updated_at: ctx.now,
      };
      const auditMeta = {
        id: correctedId,
        correctsId: id,
        version: corrected.version,
        sourceId: MANUAL_SOURCE_ID,
        originKind: 'corrected',
        status: 'active',
      };
      return {
        status: 201 as const,
        bodyJson: envelope(ctx.requestId, adapter.toDto(corrected)),
        statements: [
          insertStatement(adapter.table, corrected),
          updateStatement(
            adapter.table,
            {
              status: 'superseded',
              superseded_by: correctedId,
              updated_operation_id: opId,
              updated_at: ctx.now,
            },
            id,
          ),
          audit(ctx, adapter.entityType, correctedId, 'create', auditMeta),
          audit(ctx, adapter.entityType, id, 'update', { id, supersededBy: correctedId }),
        ],
      };
    },
  );
}

/* ----------------------------------------------------------- Importação */

function normalizeHeader(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function coerceValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric;
  }
  return trimmed;
}

interface ImportInput {
  readonly domain: LifeDomainDto;
  readonly format: 'csv' | 'json';
  readonly content: string;
}

function rawObjects(input: ImportInput, adapter: LifeAdapter): { row: number; raw: LifeRow }[] {
  if (input.format === 'csv') {
    const parsed = parseCsv(input.content);
    const unknownColumns = parsed.headers.filter(
      (header) => adapter.importMap[header] === undefined,
    );
    if (unknownColumns.length > 0) {
      throw validationError('Colunas inesperadas no arquivo.');
    }
    return parsed.rows.map(({ rowNumber, cells }) => {
      const raw: LifeRow = {};
      parsed.headers.forEach((header, index) => {
        const field = adapter.importMap[header];
        const cell = cells[index];
        if (field !== undefined && cell !== undefined) raw[field] = coerceValue(cell);
      });
      return { row: rowNumber, raw };
    });
  }
  const parsed: unknown = JSON.parse(input.content);
  if (!Array.isArray(parsed)) throw validationError('JSON deve conter uma lista de registros.');
  return parsed.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return { row: index + 1, raw: {} };
    }
    const raw: LifeRow = {};
    for (const [key, value] of Object.entries(entry)) {
      const field = adapter.importMap[normalizeHeader(key)];
      if (field !== undefined) raw[field] = value;
    }
    return { row: index + 1, raw };
  });
}

async function parseImport(
  ctx: LifeContext,
  input: ImportInput,
): Promise<{ rows: ParsedImportRow[]; issues: ImportIssueDto[] }> {
  const adapter = adapterFor(input.domain);
  assertImportLimits(
    input.content,
    input.format === 'csv' ? parseCsv(input.content).rows.length : 0,
  );
  const objects = rawObjects(input, adapter);
  assertImportLimits(input.content, objects.length);

  const existingRows = (await ctx.db.all(sql`
    SELECT ${sql.join(adapter.fields.map(identifier), sql`, `)}
    FROM ${identifier(adapter.table)} WHERE ${identifier('status')} = 'active'
    ORDER BY ${identifier('created_at')} DESC LIMIT ${READ_LIMIT}
  `)) as LifeRow[];
  const existingKeys = new Set(
    existingRows.map((row) => dedupeKeyFor(adapter.domain, adapter.toDto(row) as LifeRow)),
  );

  const issues: ImportIssueDto[] = [];
  const rows: ParsedImportRow[] = [];
  const seen = new Set<string>(existingKeys);
  for (const { row: rowNumber, raw } of objects) {
    const localIssues: ImportIssueDto[] = [];
    for (const value of Object.values(raw)) {
      if (typeof value === 'string') {
        try {
          assertSafeImportCell(value);
        } catch {
          localIssues.push({
            row: rowNumber,
            code: 'unsafe_content',
            message: 'Conteúdo potencialmente executável rejeitado.',
          });
          break;
        }
      }
    }
    const parsed = localIssues.length === 0 ? adapter.createSchema.safeParse(raw) : null;
    if (parsed !== null && !parsed.success) {
      for (const issue of parsed.error.issues.slice(0, 5)) {
        localIssues.push({
          row: rowNumber,
          code: 'invalid_row',
          message: `Campo inválido: ${issue.path.join('.') || 'registro'}.`,
        });
      }
    }
    issues.push(...localIssues);
    if (localIssues.length > 0 || parsed === null) {
      rows.push({
        row: rowNumber,
        record: {},
        key: '',
        externalId: null,
        valid: false,
        issues: localIssues,
      });
      continue;
    }
    const record = adapter.toCreateColumns(parsed.data);
    const key = dedupeKeyFor(adapter.domain, parsed.data as LifeRow);
    const duplicate = seen.has(key);
    if (!duplicate) seen.add(key);
    if (duplicate) {
      const duplicateIssue: ImportIssueDto = {
        row: rowNumber,
        code: 'duplicate',
        message: 'Registro já existe ou já foi incluído neste arquivo.',
      };
      // O problema precisa constar na linha: preview, contadores e relatório
      // leem `row.issues`, não apenas a lista global de problemas.
      localIssues.push(duplicateIssue);
      issues.push(duplicateIssue);
    }
    rows.push({
      row: rowNumber,
      record: parsed.data as LifeRow,
      key,
      externalId: nullableString(record.external_id),
      valid: localIssues.length === 0,
      issues: localIssues,
    });
  }
  return { rows, issues };
}

export async function previewImport(
  ctx: LifeContext,
  input: ImportInput,
): Promise<ImportPreviewDto> {
  const adapter = adapterFor(input.domain);
  const { rows, issues } = await parseImport(ctx, input);
  return importPreviewDtoSchema.parse({
    domain: input.domain,
    format: input.format,
    expectedColumns: Object.keys(adapter.importMap),
    rows: rows.map((row) => ({
      row: row.row,
      status: row.valid
        ? 'valid'
        : row.issues.some((issue) => issue.code === 'duplicate')
          ? 'duplicate'
          : 'invalid',
      record: row.valid ? row.record : null,
      issues: row.issues,
    })),
    total: rows.length,
    valid: rows.filter((row) => row.valid).length,
    invalid: rows.filter(
      (row) => !row.valid && !row.issues.some((issue) => issue.code === 'duplicate'),
    ).length,
    duplicates: rows.filter((row) => row.issues.some((issue) => issue.code === 'duplicate')).length,
    limitations: [
      'Pré-visualização não grava dados; a confirmação cria uma nova requisição idempotente.',
      `Deduplicação consulta até ${READ_LIMIT} registros ativos recentes.`,
      'Nenhum valor externo é executado, avaliado ou confiável por padrão.',
      ...(issues.length > 0 ? ['Linhas rejeitadas não são corrigidas automaticamente.'] : []),
    ],
  });
}

export async function commitImport(
  ctx: LifeContext,
  request: MutatingRequest,
  input: ImportInput & { fileName?: string },
): Promise<IdempotentResult> {
  const adapter = adapterFor(input.domain);
  const { rows } = await parseImport(ctx, input);
  const accepted = rows.filter((row) => row.valid);
  const duplicates = rows.filter((row) => row.issues.some((issue) => issue.code === 'duplicate'));
  const invalid = rows.filter(
    (row) => !row.valid && !row.issues.some((issue) => issue.code === 'duplicate'),
  );

  return executeIdempotent(mutationContext(ctx, request), ({ opId }) => {
    const batchId = newId();
    const statements: SQL[] = [
      // O lote precisa existir antes dos registros que o referenciam: o D1
      // verifica FKs imediatamente, statement a statement, dentro do batch.
      insertStatement('life_import_batches', {
        id: batchId,
        domain: adapter.domain,
        format: input.format,
        file_name: input.fileName ?? null,
        total: rows.length,
        imported: accepted.length,
        invalid: invalid.length,
        duplicates: duplicates.length,
        report_json: JSON.stringify({
          total: rows.length,
          imported: accepted.length,
          invalid: invalid.length,
          duplicates: duplicates.length,
          issueCodes: [...new Set(rows.flatMap((row) => row.issues.map((issue) => issue.code)))],
        }),
        source_id: IMPORT_SOURCE_ID,
        version: 1,
        created_operation_id: opId,
        created_at: ctx.now,
      }),
    ];
    for (const row of accepted) {
      const columns = adapter.toCreateColumns(row.record);
      const values = {
        id: newId(),
        ...commonInsertValues(ctx, opId, true),
        ...columns,
        ...(adapter.importBatchColumn === undefined
          ? {}
          : { [adapter.importBatchColumn]: batchId }),
        algorithm_version: algorithmVersionFor(adapter.domain),
      };
      statements.push(insertStatement(adapter.table, values));
    }
    statements.push(
      audit(ctx, 'life_import_batch', batchId, 'create', {
        id: batchId,
        domain: adapter.domain,
        format: input.format,
        total: rows.length,
        imported: accepted.length,
      }),
    );
    return {
      status: 201 as const,
      bodyJson: envelope(ctx.requestId, {
        batchId,
        domain: adapter.domain,
        format: input.format,
        fileName: input.fileName ?? null,
        total: rows.length,
        imported: accepted.length,
        invalid: invalid.length,
        duplicates: duplicates.length,
        issues: rows.flatMap((row) => row.issues),
      }),
      statements,
    };
  });
}

export async function listImports(ctx: LifeContext, limit: number): Promise<LifeRow[]> {
  return (await ctx.db.all(sql`
    SELECT id, domain, format, file_name, total, imported, invalid, duplicates, created_at
    FROM life_import_batches ORDER BY created_at DESC LIMIT ${Math.min(READ_LIMIT, limit)}
  `)) as LifeRow[];
}

/* ---------------------------------------------------------- Indicadores */

function toPeriod(query: LifePeriodQuery): { from: string; to: string } {
  return { from: query.from, to: query.to };
}

export async function getFinanceSummary(ctx: LifeContext, query: LifePeriodQuery) {
  const { from, to } = toPeriod(query);
  const transactions = (await ctx.db.all(sql`
    SELECT kind, amount_cents, date, category_id FROM finance_transactions
    WHERE date >= ${from} AND date <= ${to} LIMIT ${READ_LIMIT}
  `)) as LifeRow[];
  const balanceItems = (await ctx.db.all(sql`
    SELECT kind, amount_cents, date FROM finance_balance_items
    WHERE date >= ${from} AND date <= ${to} LIMIT ${READ_LIMIT}
  `)) as LifeRow[];
  const accounts = (await ctx.db.all(sql`
    SELECT id, include_in_patrimony FROM finance_accounts
    WHERE status = 'active' LIMIT ${READ_LIMIT}
  `)) as LifeRow[];
  const result = computeFinanceSummary({
    from,
    to,
    transactions: transactions.map((row) => ({
      kind: String(row.kind) as 'income' | 'expense' | 'transfer',
      amountCents: Number(row.amount_cents),
      date: String(row.date),
      categoryId: nullableString(row.category_id),
    })),
    balanceItems: balanceItems.map((row) => ({
      kind: String(row.kind) as 'asset' | 'debt',
      amountCents: Number(row.amount_cents),
      date: String(row.date),
    })),
    patrimonyAccountIds: accounts
      .filter((row) => Number(row.include_in_patrimony) === 1)
      .map((row) => String(row.id)),
  });
  const limitations = [
    ...result.limitations,
    ...(transactions.length === READ_LIMIT || balanceItems.length === READ_LIMIT
      ? ['Consulta limitada a 200 registros por origem; o período pode estar incompleto.']
      : []),
  ];
  return financeSummaryDtoSchema.parse({ ...result, limitations });
}

export async function getHealthSummary(ctx: LifeContext, query: LifePeriodQuery) {
  const { from, to } = toPeriod(query);
  const rows = (await ctx.db.all(sql`
    SELECT m.key AS metric_key, o.date AS date, o.value AS value
    FROM health_observations o INNER JOIN health_metrics m ON m.id = o.metric_id
    WHERE o.date >= ${from} AND o.date <= ${to}
    ORDER BY o.date DESC LIMIT ${READ_LIMIT}
  `)) as LifeRow[];
  return healthSummaryDtoSchema.parse(
    computeHealthSummary(
      from,
      to,
      rows.map((row) => ({
        metricKey: String(row.metric_key),
        date: String(row.date),
        value: Number(row.value),
      })),
    ),
  );
}

export async function getTrainingSummary(ctx: LifeContext, query: LifePeriodQuery) {
  const { from, to } = toPeriod(query);
  const rows = (await ctx.db.all(sql`
    SELECT activity_type, date, duration_minutes, volume, distance_meters, intensity
    FROM training_sessions WHERE date >= ${from} AND date <= ${to}
    ORDER BY date DESC LIMIT ${READ_LIMIT}
  `)) as LifeRow[];
  const result = computeTrainingSummary(
    from,
    to,
    rows.map((row) => ({
      activityType: String(row.activity_type),
      date: String(row.date),
      durationMinutes: Number(row.duration_minutes),
      volume: typeof row.volume === 'number' ? row.volume : null,
      distanceMeters: typeof row.distance_meters === 'number' ? row.distance_meters : null,
      intensity: typeof row.intensity === 'number' ? row.intensity : null,
    })),
  );
  return trainingSummaryDtoSchema.parse({
    ...result,
    limitations: [
      ...result.limitations,
      ...(rows.length === READ_LIMIT ? ['Consulta limitada a 200 sessões.'] : []),
    ],
  });
}

export async function getReadingSummary(ctx: LifeContext, query: LifePeriodQuery) {
  const { from, to } = toPeriod(query);
  const materials = (await ctx.db.all(sql`
    SELECT id, reading_status, total_pages FROM reading_materials
    WHERE status = 'active' LIMIT ${READ_LIMIT}
  `)) as LifeRow[];
  const sessions = (await ctx.db.all(sql`
    SELECT material_id, date, minutes, pages_read FROM reading_sessions
    WHERE date >= ${from} AND date <= ${to} LIMIT ${READ_LIMIT}
  `)) as LifeRow[];
  const notes = (await ctx.db.all(sql`
    SELECT id FROM reading_notes WHERE date >= ${from} AND date <= ${to} LIMIT ${READ_LIMIT}
  `)) as LifeRow[];
  const result = computeReadingSummary(
    from,
    to,
    materials.map((row) => ({
      id: String(row.id),
      status: String(row.reading_status) as 'planned' | 'reading' | 'finished' | 'paused',
      totalPages: typeof row.total_pages === 'number' ? row.total_pages : null,
    })),
    sessions.map((row) => ({
      materialId: String(row.material_id),
      date: String(row.date),
      minutes: typeof row.minutes === 'number' ? row.minutes : null,
      pagesRead: typeof row.pages_read === 'number' ? row.pages_read : null,
    })),
    notes.length,
  );
  return readingSummaryDtoSchema.parse(result);
}

export async function getTimeSummary(ctx: LifeContext, query: LifePeriodQuery) {
  const { from, to } = toPeriod(query);
  const entries = (await ctx.db.all(sql`
    SELECT id, date, start_at, end_at, duration_minutes, project_id, task_id, area_id
    FROM time_entries WHERE date >= ${from} AND date <= ${to}
    ORDER BY date DESC LIMIT ${READ_LIMIT}
  `)) as LifeRow[];
  const taskIds = [
    ...new Set(entries.map((row) => nullableString(row.task_id)).filter((id) => id !== null)),
  ];
  const tasks =
    taskIds.length === 0
      ? []
      : ((await ctx.db.all(sql`
        SELECT id, estimate_minutes FROM tasks
        WHERE id IN (${sql.join(
          taskIds.map((id) => sql`${id}`),
          sql`, `,
        )}) LIMIT ${taskIds.length}
      `)) as LifeRow[]);
  const result = computeTimeSummary(
    from,
    to,
    entries.map((row) => ({
      id: String(row.id),
      date: String(row.date),
      durationMinutes: Number(row.duration_minutes),
      startAt: nullableString(row.start_at),
      endAt: nullableString(row.end_at),
      projectId: nullableString(row.project_id),
      taskId: nullableString(row.task_id),
      areaId: nullableString(row.area_id),
    })),
    tasks.map((row) => ({
      id: String(row.id),
      estimateMinutes: typeof row.estimate_minutes === 'number' ? row.estimate_minutes : null,
    })),
  );
  return timeSummaryDtoSchema.parse({
    ...result,
    limitations: [
      ...result.limitations,
      ...(entries.length === READ_LIMIT ? ['Consulta limitada a 200 registros de tempo.'] : []),
    ],
  });
}

async function countInRange(
  ctx: LifeContext,
  table: string,
  from: string,
  to: string,
  dateColumn: string | null,
): Promise<number> {
  const condition =
    dateColumn === null
      ? sql`WHERE ${identifier('status')} = 'active'`
      : sql`WHERE ${identifier(dateColumn)} >= ${from} AND ${identifier(dateColumn)} <= ${to}`;
  const rows = (await ctx.db.all(sql`
    SELECT count(*) AS total FROM ${identifier(table)} ${condition}
  `)) as { total: number }[];
  return Number(rows[0]?.total ?? 0);
}

export async function getIntegration(ctx: LifeContext, query: LifePeriodQuery) {
  const { from, to } = toPeriod(query);
  const financeObservations = await countInRange(ctx, 'finance_transactions', from, to, 'date');
  const healthObservations = await countInRange(ctx, 'health_observations', from, to, 'date');
  const trainingObservations = await countInRange(ctx, 'training_sessions', from, to, 'date');
  const readingObservations = await countInRange(ctx, 'reading_sessions', from, to, 'date');
  const timeObservations = await countInRange(ctx, 'time_entries', from, to, 'date');
  const planning = (await ctx.db.all(sql`
    SELECT
      (SELECT count(*) FROM planning_cycles) AS cycles,
      (SELECT count(*) FROM capacity_profiles) AS capacity,
      (SELECT count(*) FROM weekly_reviews) AS reviews
  `)) as { cycles: number; capacity: number; reviews: number }[];
  const intelligence = (await ctx.db.all(sql`
    SELECT count(*) AS total FROM metric_observations
  `)) as { total: number }[];
  const planningSources = [
    ...(Number(planning[0]?.cycles ?? 0) > 0 ? ['planning'] : []),
    ...(Number(planning[0]?.capacity ?? 0) > 0 ? ['capacity'] : []),
    ...(Number(planning[0]?.reviews ?? 0) > 0 ? ['weekly_review'] : []),
  ];
  const intelligenceSources = Number(intelligence[0]?.total ?? 0) > 0 ? ['intelligence'] : [];
  return lifeIntegrationDtoSchema.parse(
    computeLifeIntegration({
      from,
      to,
      financeObservations,
      healthObservations,
      trainingObservations,
      readingObservations,
      timeObservations,
      planningSources,
      intelligenceSources,
    }),
  );
}

export async function getDashboard(ctx: LifeContext, query: LifePeriodQuery) {
  // Subconsultas escalares em uma única consulta: o D1 limita o número de
  // termos de um UNION ALL, e o painel precisa contar todas as doze tabelas.
  const countsQuery = sql.join(
    LIFE_ADAPTERS.map(
      (adapter) =>
        sql`(SELECT count(*) FROM ${identifier(adapter.table)}) AS ${sql.raw(`"${adapter.domain}"`)}`,
    ),
    sql`, `,
  );
  const counts = (await ctx.db.all(sql`SELECT ${countsQuery}`)) as Record<string, number>[];
  const totals = counts[0] ?? {};
  const totalByDomain = new Map(
    LIFE_ADAPTERS.map((adapter) => [adapter.domain, Number(totals[adapter.domain] ?? 0)]),
  );
  const integration = await getIntegration(ctx, query);
  return lifeDashboardDtoSchema.parse({
    period: toPeriod(query),
    domains: LIFE_ADAPTERS.map((adapter) => ({
      domain: adapter.domain,
      label: adapter.label,
      available: true,
      recordCount: totalByDomain.get(adapter.domain) ?? 0,
    })),
    integration,
    algorithms: LIFE_ALGORITHMS,
  });
}
