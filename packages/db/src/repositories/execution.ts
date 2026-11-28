import { sql, type SQL } from 'drizzle-orm';
import type { Database } from '../client';
import { projectMilestones } from '../schema/project-milestones';

export interface MilestoneForExecutionRow {
  id: string;
  projectId: string;
  title: string;
  status: string;
  dueDate: string | null;
  position: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineEventRow {
  id: string;
  kind: string;
  occurredAt: string;
  projectId: string | null;
  entityId: string;
  title: string;
  detail: string | null;
  status: string | null;
}

/** Consulta única do dashboard para marcos; nenhum dado de tarefa é buscado aqui. */
export function listMilestonesForExecution(
  db: Database,
  limit = 200,
): Promise<MilestoneForExecutionRow[]> {
  return db
    .select({
      id: projectMilestones.id,
      projectId: projectMilestones.projectId,
      title: projectMilestones.title,
      status: projectMilestones.status,
      dueDate: projectMilestones.dueDate,
      position: projectMilestones.position,
      completedAt: projectMilestones.completedAt,
      createdAt: projectMilestones.createdAt,
      updatedAt: projectMilestones.updatedAt,
    })
    .from(projectMilestones)
    .where(sql`${projectMilestones.deletedAt} IS NULL`)
    .orderBy(sql`${projectMilestones.id} ASC`)
    .limit(limit);
}

export interface TimelineFilters {
  projectId?: string;
  from?: string;
  to?: string;
  /** `occurredAt` é opcional para aceitar o cursor `event:<uuid>` do contrato atual. */
  cursor?: { occurredAt?: string; id: string };
  limit: number;
}

interface RawTimelineEventRow {
  id: string;
  kind: string;
  occurred_at: string;
  project_id: string | null;
  entity_id: string;
  title: string;
  detail: string | null;
  status: string | null;
}

/**
 * Linha do tempo derivada do estado atual das entidades de execução (ADR-0007):
 * uma linha por projeto/tarefa/marco, com `completion` para itens concluídos.
 * Filtros e cursor são aplicados no SQL; a API só converte para o DTO.
 */
export async function listTimelineEvents(
  db: Database,
  filters: TimelineFilters,
): Promise<TimelineEventRow[]> {
  const conditions: SQL[] = [];
  if (filters.projectId !== undefined) conditions.push(sql`project_id = ${filters.projectId}`);
  if (filters.from !== undefined)
    conditions.push(sql`substr(occurred_at, 1, 10) >= ${filters.from}`);
  if (filters.to !== undefined) conditions.push(sql`substr(occurred_at, 1, 10) <= ${filters.to}`);
  if (filters.cursor !== undefined) {
    if (filters.cursor.occurredAt !== undefined) {
      conditions.push(
        sql`(occurred_at < ${filters.cursor.occurredAt}
          OR (occurred_at = ${filters.cursor.occurredAt} AND id < ${filters.cursor.id}))`,
      );
    } else {
      conditions.push(sql`id < ${filters.cursor.id}`);
    }
  }
  const whereClause =
    conditions.length === 0 ? sql.empty() : sql`WHERE ${sql.join(conditions, sql` AND `)}`;

  const rows = await db.all<RawTimelineEventRow>(sql`
    SELECT id, kind, occurred_at, project_id, entity_id, title, detail, status
    FROM (
      SELECT p.id AS id, 'project' AS kind, p.created_at AS occurred_at,
             p.id AS project_id, p.id AS entity_id, p.title AS title,
             p.description AS detail, p.status AS status
      FROM projects p
      WHERE p.deleted_at IS NULL
      UNION ALL
      SELECT t.id,
             CASE WHEN t.status = 'completed' THEN 'completion' ELSE 'task' END,
             COALESCE(t.completed_at, t.created_at), t.project_id, t.id, t.title,
             t.description, t.status
      FROM tasks t
      WHERE t.deleted_at IS NULL
      UNION ALL
      SELECT m.id,
             CASE WHEN m.status = 'completed' THEN 'completion' ELSE 'milestone' END,
             COALESCE(m.completed_at, m.created_at), m.project_id, m.id, m.title,
             NULL, m.status
      FROM project_milestones m
      WHERE m.deleted_at IS NULL
    ) AS timeline
    ${whereClause}
    ORDER BY occurred_at DESC, id DESC
    LIMIT ${filters.limit + 1}
  `);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    occurredAt: row.occurred_at,
    projectId: row.project_id,
    entityId: row.entity_id,
    title: row.title,
    detail: row.detail,
    status: row.status,
  }));
}
