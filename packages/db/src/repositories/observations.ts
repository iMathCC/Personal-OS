import { and, desc, eq, gte, isNull, lte, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../client';
import { areas, personalObservations } from '../schema';

export interface PersonalObservationRow {
  id: string;
  areaId: string | null;
  areaKey: string | null;
  areaName: string | null;
  kind: string;
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
  evidenceJson: string | null;
  relatedTaskId: string | null;
  relatedProjectId: string | null;
  relatedGoalId: string | null;
  relatedStudySessionId: string | null;
  relatedCourseId: string | null;
  status: string;
  supersededBy: string | null;
  correctsId: string | null;
  version: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const OBS_FIELDS = {
  id: personalObservations.id,
  areaId: personalObservations.areaId,
  areaKey: areas.key,
  areaName: areas.name,
  kind: personalObservations.kind,
  title: personalObservations.title,
  content: personalObservations.content,
  observedAt: personalObservations.observedAt,
  localDate: personalObservations.localDate,
  timezone: personalObservations.timezone,
  valueNum: personalObservations.valueNum,
  valueText: personalObservations.valueText,
  unit: personalObservations.unit,
  sourceId: personalObservations.sourceId,
  confidence: personalObservations.confidence,
  algorithmVersion: personalObservations.algorithmVersion,
  evidenceJson: personalObservations.evidenceJson,
  relatedTaskId: personalObservations.relatedTaskId,
  relatedProjectId: personalObservations.relatedProjectId,
  relatedGoalId: personalObservations.relatedGoalId,
  relatedStudySessionId: personalObservations.relatedStudySessionId,
  relatedCourseId: personalObservations.relatedCourseId,
  status: personalObservations.status,
  supersededBy: personalObservations.supersededBy,
  correctsId: personalObservations.correctsId,
  version: personalObservations.version,
  deletedAt: personalObservations.deletedAt,
  createdAt: personalObservations.createdAt,
  updatedAt: personalObservations.updatedAt,
} as const;

export async function findPersonalObservationById(
  db: Database,
  id: string,
): Promise<PersonalObservationRow | undefined> {
  const rows = await db
    .select(OBS_FIELDS)
    .from(personalObservations)
    .leftJoin(areas, eq(personalObservations.areaId, areas.id))
    .where(eq(personalObservations.id, id))
    .limit(1);
  return rows[0] as PersonalObservationRow | undefined;
}

export interface ListObservationsParams {
  from?: string;
  to?: string;
  kind?: string;
  areaId?: string;
  status?: string;
  relatedTaskId?: string;
  relatedProjectId?: string;
  relatedGoalId?: string;
  relatedStudySessionId?: string;
  cursor?: { sortValue: string; id: string };
  limit: number;
}

export async function listPersonalObservationRows(
  db: Database,
  params: ListObservationsParams,
): Promise<PersonalObservationRow[]> {
  const conditions: SQL[] = [isNull(personalObservations.deletedAt)];
  if (params.from) conditions.push(gte(personalObservations.localDate, params.from));
  if (params.to) conditions.push(lte(personalObservations.localDate, params.to));
  if (params.kind)
    conditions.push(
      eq(personalObservations.kind, params.kind as typeof personalObservations.$inferSelect.kind),
    );
  if (params.areaId) conditions.push(eq(personalObservations.areaId, params.areaId));
  if (params.status)
    conditions.push(
      eq(
        personalObservations.status,
        params.status as typeof personalObservations.$inferSelect.status,
      ),
    );
  if (params.relatedTaskId)
    conditions.push(eq(personalObservations.relatedTaskId, params.relatedTaskId));
  if (params.relatedProjectId)
    conditions.push(eq(personalObservations.relatedProjectId, params.relatedProjectId));
  if (params.relatedGoalId)
    conditions.push(eq(personalObservations.relatedGoalId, params.relatedGoalId));
  if (params.relatedStudySessionId)
    conditions.push(eq(personalObservations.relatedStudySessionId, params.relatedStudySessionId));
  if (params.cursor) {
    conditions.push(
      sql`(${personalObservations.observedAt} < ${params.cursor.sortValue} OR (${personalObservations.observedAt} = ${params.cursor.sortValue} AND ${personalObservations.id} < ${params.cursor.id}))`,
    );
  }

  const rows = await db
    .select(OBS_FIELDS)
    .from(personalObservations)
    .leftJoin(areas, eq(personalObservations.areaId, areas.id))
    .where(and(...conditions))
    .orderBy(desc(personalObservations.observedAt), desc(personalObservations.id))
    .limit(params.limit + 1);
  return rows as PersonalObservationRow[];
}

export async function listObservationSummaryRows(
  db: Database,
  from: string,
  to: string,
  areaId?: string,
): Promise<
  Array<{
    id: string;
    localDate: string;
    kind: string;
    areaId: string | null;
    areaKey: string | null;
    areaName: string | null;
  }>
> {
  const conditions: SQL[] = [
    isNull(personalObservations.deletedAt),
    eq(personalObservations.status, 'active'),
    gte(personalObservations.localDate, from),
    lte(personalObservations.localDate, to),
  ];
  if (areaId) conditions.push(eq(personalObservations.areaId, areaId));
  const rows = await db
    .select({
      id: personalObservations.id,
      localDate: personalObservations.localDate,
      kind: personalObservations.kind,
      areaId: personalObservations.areaId,
      areaKey: areas.key,
      areaName: areas.name,
    })
    .from(personalObservations)
    .leftJoin(areas, eq(personalObservations.areaId, areas.id))
    .where(and(...conditions))
    .limit(5000);
  return rows as Array<{
    id: string;
    localDate: string;
    kind: string;
    areaId: string | null;
    areaKey: string | null;
    areaName: string | null;
  }>;
}

export function insertPersonalObservationStatement(input: {
  id: string;
  areaId: string | null;
  kind: string;
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
  evidenceJson: string | null;
  relatedTaskId: string | null;
  relatedProjectId: string | null;
  relatedGoalId: string | null;
  relatedStudySessionId: string | null;
  relatedCourseId: string | null;
  status: string;
  correctsId: string | null;
  opId: string;
  now: string;
}): SQL {
  return sql`
    INSERT INTO personal_observations (
      id, area_id, kind, title, content, observed_at, local_date, timezone,
      value_num, value_text, unit, source_id, confidence, algorithm_version, evidence_json,
      related_task_id, related_project_id, related_goal_id, related_study_session_id, related_course_id,
      status, superseded_by, corrects_id, version,
      created_operation_id, updated_operation_id, delete_operation_id, deleted_at, created_at, updated_at
    ) VALUES (
      ${input.id}, ${input.areaId}, ${input.kind}, ${input.title}, ${input.content},
      ${input.observedAt}, ${input.localDate}, ${input.timezone},
      ${input.valueNum}, ${input.valueText}, ${input.unit},
      ${input.sourceId}, ${input.confidence}, ${input.algorithmVersion}, ${input.evidenceJson},
      ${input.relatedTaskId}, ${input.relatedProjectId}, ${input.relatedGoalId},
      ${input.relatedStudySessionId}, ${input.relatedCourseId},
      ${input.status}, NULL, ${input.correctsId}, 1,
      ${input.opId}, ${input.opId}, NULL, NULL, ${input.now}, ${input.now}
    )
  `;
}

export function supersedePersonalObservationStatement(input: {
  id: string;
  replacementId: string;
  expectedVersion: number;
  opId: string;
  now: string;
}): SQL {
  return sql`
    UPDATE personal_observations
    SET status = 'superseded', superseded_by = ${input.replacementId},
        updated_operation_id = ${input.opId}, updated_at = ${input.now},
        version = version + 1
    WHERE id = ${input.id} AND version = ${input.expectedVersion} AND superseded_by IS NULL AND deleted_at IS NULL
  `;
}
