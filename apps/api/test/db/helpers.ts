import { env } from 'cloudflare:workers';
import initMigration from '../../migrations/0000_init.sql?raw';
import integrityMigration from '../../migrations/0001_audit_append_only.sql?raw';
import replaceGuardMigration from '../../migrations/0002_audit_no_replace.sql?raw';
import coreMigration from '../../migrations/0003_core_studies.sql?raw';
import milestonesMigration from '../../migrations/0004_goals_milestones.sql?raw';
import executionMigration from '../../migrations/0005_execution_layer.sql?raw';
import reviewsMigration from '../../migrations/0006_weekly_reviews.sql?raw';
import planningMigration from '../../migrations/0007_strategic_planning.sql?raw';
import lifeMigration from '../../migrations/0008_life_data.sql?raw';
import decisionMigration from '../../migrations/0009_decision_alert_states.sql?raw';
import indexAlignmentMigration from '../../migrations/0010_index_alignment.sql?raw';
import idempotencyGuardMigration from '../../migrations/0011_idempotency_no_replace.sql?raw';
import adaptationMigration from '../../migrations/0012_chilly_praxagora.sql?raw';
import observationsMigration from '../../migrations/0013_overrated_nebula.sql?raw';

export type Binding = string | number | null | Uint8Array | ArrayBuffer;

export const USER_ID = '01a1fb52-074d-7043-a390-6e59235799d4';
export const OTHER_USER_ID = '01a1fb52-074d-7043-a390-71e7d32278a1';
export const AREA_ID = '01a1fb52-074d-7043-a390-755bd43bc886';
export const SOURCE_ID = 'src_manual';

export function testDb(): D1Database {
  const database = env.DB_TEST;
  if (database === undefined) throw new Error('DB_TEST indisponível neste ambiente.');
  return database;
}

// Ordem inversa das dependências: filhos antes dos pais, para que o DROP não
// viole FKs remanescentes. Inclui as tabelas da migração 0003.
const DROP_ORDER = [
  'personal_observations',
  'adaptation_decisions',
  'intelligence_alert_states',
  'health_observations',
  'health_metrics',
  'finance_transactions',
  'finance_balance_items',
  'finance_categories',
  'finance_accounts',
  'reading_notes',
  'reading_sessions',
  'reading_materials',
  'training_sessions',
  'time_entries',
  'life_import_batches',
  'planning_cycle_objectives',
  'planning_cycle_reviews',
  'capacity_unavailability',
  'capacity_profiles',
  'strategic_goals',
  'planning_scenarios',
  'planning_cycles',
  'strategic_area_profiles',
  'life_vision_versions',
  'weekly_reviews',
  'task_dependencies',
  'tasks',
  'project_milestones',
  'project_goals',
  'projects',
  'events',
  'metric_observations',
  'goal_milestones',
  'goal_metrics',
  'goals',
  'study_sessions',
  'courses',
  'metrics',
  'operation_results',
  'idempotency_key_reservations',
  'audit_log',
  'auth_challenges',
  'idempotency_keys',
  'passkeys',
  'rate_limits',
  'recovery_codes',
  'recovery_tokens',
  'sessions',
  'areas',
  'sources',
  'users',
  'app_settings',
];

export async function resetDatabase(): Promise<void> {
  const database = testDb();
  await database.exec('PRAGMA foreign_keys = OFF');

  const dropTriggers = async () => {
    const triggers = await database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name NOT LIKE 'sqlite_%'")
      .all<{ name: string }>();
    for (const trigger of triggers.results) {
      await database.exec(`DROP TRIGGER IF EXISTS "${trigger.name}"`);
    }
  };

  await dropTriggers();

  // Limpa auto-referências que podem bloquear DELETE/DROP sob restrições.
  try {
    await database.exec(
      'UPDATE "personal_observations" SET superseded_by = NULL, corrects_id = NULL WHERE superseded_by IS NOT NULL OR corrects_id IS NOT NULL',
    );
  } catch {
    // tabela pode não existir
  }

  for (const table of DROP_ORDER) {
    try {
      await database.exec(`DELETE FROM "${table}"`);
    } catch {
      // ignore - tabela ausente ou ordem inesperada
    }
  }

  for (const table of DROP_ORDER) {
    try {
      await database.exec(`DROP TABLE IF EXISTS "${table}"`);
    } catch {
      await database.exec('PRAGMA foreign_keys = OFF');
      await dropTriggers();
      try {
        await database.exec(`DELETE FROM "${table}"`);
      } catch {
        // ignore
      }
      await database.exec(`DROP TABLE IF EXISTS "${table}"`);
    }
  }

  // Remove qualquer objeto leftover (por exemplo, tabela de versões do Wrangler).
  const remaining = await database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all<{ name: string }>();
  for (const table of remaining.results) {
    try {
      await database.exec(`DELETE FROM "${table.name}"`);
    } catch {
      // ignore
    }
  }
  await dropTriggers();
  const remainingAfterDelete = await database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all<{ name: string }>();
  for (const table of remainingAfterDelete.results) {
    await database.exec(`DROP TABLE IF EXISTS "${table.name}"`);
  }

  await database.exec('PRAGMA foreign_keys = ON');
}

export async function executeSql(sql: string): Promise<void> {
  // O `exec()` do D1 em Workers falha com "incomplete input" quando uma
  // statement ocupa várias linhas. Comentários também precisam sair antes de
  // colapsar: `--` passaria a comentar o resto do arquivo inteiro.
  const normalized = sql
    .replace(/-->\s*statement-breakpoint/g, ' ')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length > 0) {
    await testDb().exec(normalized);
  }
}

export async function applyMigration(sql: string): Promise<void> {
  await executeSql(sql);
}

export async function applyInitialSchema(): Promise<void> {
  await applyMigration(initMigration);
}

export async function applyIntegrityMigration(): Promise<void> {
  await applyMigration(integrityMigration);
}

export async function applyReplaceGuardMigration(): Promise<void> {
  await applyMigration(replaceGuardMigration);
}

export async function applyFullSchema(): Promise<void> {
  await applyInitialSchema();
  await applyIntegrityMigration();
  await applyReplaceGuardMigration();
}

/** Migração da Entrega 5, aplicada explicitamente pelos testes do novo modelo. */
export async function applyCoreMigration(): Promise<void> {
  await applyMigration(coreMigration);
}

export async function applyCoreSchema(): Promise<void> {
  await applyFullSchema();
  await applyCoreMigration();
}

/** Apenas a migração 0004, para testes de upgrade a partir da migração 0003. */
export async function applyMilestonesMigration(): Promise<void> {
  await applyMigration(milestonesMigration);
}

/** Inclui a migração de marcos; usada pelas suítes de Objetivos. */
export async function applyGoalsSchema(): Promise<void> {
  await applyCoreSchema();
  await applyMilestonesMigration();
}

/** Apenas a migração 0005, para testes de upgrade a partir da migração 0004. */
export async function applyExecutionMigration(): Promise<void> {
  await applyMigration(executionMigration);
}

/** Schema completo incluindo a camada de execução. */
export async function applyExecutionSchema(): Promise<void> {
  await applyGoalsSchema();
  await applyExecutionMigration();
}

/** Apenas a migração 0006, para testes de upgrade a partir da migração 0005. */
export async function applyReviewsMigration(): Promise<void> {
  await applyMigration(reviewsMigration);
}

/** Schema completo incluindo revisões semanais persistidas. */
export async function applyIntelligenceSchema(): Promise<void> {
  await applyExecutionSchema();
  await applyReviewsMigration();
}

/** Apenas a migração 0007, para testes de upgrade a partir da migração 0006. */
export async function applyPlanningMigration(): Promise<void> {
  await applyMigration(planningMigration);
}

/** Schema completo incluindo planejamento estratégico da Entrega 16. */
export async function applyPlanningSchema(): Promise<void> {
  await applyIntelligenceSchema();
  await applyPlanningMigration();
}

/** Apenas a migração 0008, para testes de upgrade a partir da migração 0007. */
export async function applyLifeMigration(): Promise<void> {
  await applyMigration(lifeMigration);
}

/** Schema completo incluindo a camada de dados pessoais da Entrega 17. */
export async function applyLifeSchema(): Promise<void> {
  await applyPlanningSchema();
  await applyLifeMigration();
}

/** Apenas a migração 0009, para testes de upgrade a partir da migração 0008. */
export async function applyDecisionMigration(): Promise<void> {
  await applyMigration(decisionMigration);
}

/** Schema completo incluindo o estado de alertas da Entrega 18. */
export async function applyDecisionSchema(): Promise<void> {
  await applyLifeSchema();
  await applyDecisionMigration();
}

/** Apenas a migração 0010, para testes de upgrade a partir da migração 0009. */
export async function applyIndexAlignmentMigration(): Promise<void> {
  await applyMigration(indexAlignmentMigration);
}

/** Apenas a migração 0011, para testes de upgrade a partir da migração 0010. */
export async function applyIdempotencyGuardMigration(): Promise<void> {
  await applyMigration(idempotencyGuardMigration);
}

/** Apenas a migração 0012, para testes de upgrade a partir da migração 0011. */
export async function applyAdaptationMigration(): Promise<void> {
  await applyMigration(adaptationMigration);
}

/** Schema completo incluindo decisões de adaptação da Entrega 27. */
export async function applyAdaptationSchema(): Promise<void> {
  await applyDecisionSchema();
  await applyIndexAlignmentMigration();
  await applyIdempotencyGuardMigration();
  await applyAdaptationMigration();
}

/** Apenas a migração 0013, para testes de upgrade a partir da migração 0012. */
export async function applyObservationsMigration(): Promise<void> {
  await applyMigration(observationsMigration);
}

/** Schema completo incluindo observações pessoais (D37). */
export async function applyObservationsSchema(): Promise<void> {
  await applyAdaptationSchema();
  await applyObservationsMigration();
}

/** Schema completo até a entrega atual, incluindo observações pessoais. */
export async function applyCurrentSchema(): Promise<void> {
  await applyObservationsSchema();
}

export async function all<T>(sql: string, ...values: Binding[]): Promise<T[]> {
  const statement =
    values.length === 0
      ? testDb().prepare(sql)
      : testDb()
          .prepare(sql)
          .bind(...values);
  const result = await statement.all<T>();
  return result.results;
}

export async function first<T>(sql: string, ...values: Binding[]): Promise<T> {
  const statement =
    values.length === 0
      ? testDb().prepare(sql)
      : testDb()
          .prepare(sql)
          .bind(...values);
  const row = await statement.first<T>();
  if (row === null) {
    throw new Error('Esperava uma linha, mas a consulta não retornou resultados.');
  }
  return row;
}

export async function run(sql: string, ...values: Binding[]): Promise<void> {
  const statement =
    values.length === 0
      ? testDb().prepare(sql)
      : testDb()
          .prepare(sql)
          .bind(...values);
  await statement.run();
}

export async function insertUser(id = USER_ID): Promise<void> {
  await run('INSERT INTO users (id, display_name) VALUES (?, ?)', id, 'Usuário de teste');
}

export async function insertArea(id = AREA_ID): Promise<void> {
  await run(
    'INSERT INTO areas (id, key, name, source_id) VALUES (?, ?, ?, ?)',
    id,
    'finance',
    'Finanças',
    SOURCE_ID,
  );
}

export async function insertAudit(
  action = 'create',
  requestId: string | null = null,
): Promise<void> {
  await run(
    'INSERT INTO audit_log (entity_type, entity_id, action, actor_type, request_id) VALUES (?, ?, ?, ?, ?)',
    'area',
    AREA_ID,
    action,
    'system',
    requestId,
  );
}

export async function tableNames(): Promise<string[]> {
  const rows = await all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return rows.map((row) => row.name);
}

export async function indexNames(table: string): Promise<string[]> {
  const rows = await all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name NOT LIKE 'sqlite_%' ORDER BY name",
    table,
  );
  return rows.map((row) => row.name);
}

export async function queryPlan(sql: string, ...values: Binding[]): Promise<string> {
  const statement =
    values.length === 0
      ? testDb().prepare(`EXPLAIN QUERY PLAN ${sql}`)
      : testDb()
          .prepare(`EXPLAIN QUERY PLAN ${sql}`)
          .bind(...values);
  const rows = await statement.all<{ detail: string }>();
  return rows.results.map((row) => row.detail).join('\n');
}
