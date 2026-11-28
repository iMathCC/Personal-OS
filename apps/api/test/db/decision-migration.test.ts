import seedSql from '../../../../packages/db/src/seed.sql?raw';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  all,
  applyDecisionMigration,
  applyDecisionSchema,
  applyLifeSchema,
  executeSql,
  first,
  indexNames,
  resetDatabase,
  run,
  tableNames,
} from './helpers';

const ALERT_TABLE = 'intelligence_alert_states';

describe('migração 0009 — estado de alertas de decisão', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('instala a tabela aditiva com índices e restrições', async () => {
    await applyDecisionSchema();

    expect(await tableNames()).toContain(ALERT_TABLE);
    expect(await indexNames(ALERT_TABLE)).toEqual(
      expect.arrayContaining([
        'uq_intelligence_alert_states_alert',
        'idx_intelligence_alert_states_area',
        'idx_intelligence_alert_states_source',
      ]),
    );

    await expect(
      run(
        `INSERT INTO ${ALERT_TABLE} (id, alert_id, state, rule_version, area, source_id)
         VALUES ('decision-bad', 'alert-bad', 'open', 'early-warning-v1', 'tasks', 'src_manual')`,
      ),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it('faz upgrade a partir da 0008 preservando dados e seeds', async () => {
    await applyLifeSchema();
    await executeSql(seedSql);
    await run(
      `INSERT INTO audit_log (entity_type, entity_id, action, actor_type)
       VALUES ('finance_transaction', 'upgrade-transaction', 'create', 'system')`,
    );

    await applyDecisionMigration();
    await executeSql(seedSql);

    expect(await first<{ action: string }>('SELECT action FROM audit_log')).toEqual({
      action: 'create',
    });
    await run(
      `INSERT INTO ${ALERT_TABLE} (id, alert_id, state, rule_version, area, source_id)
       VALUES ('decision-upgrade', 'alert-upgrade', 'acknowledged', 'early-warning-v1', 'finance', 'src_manual')`,
    );
    expect(await all<{ state: string }>(`SELECT state FROM ${ALERT_TABLE}`)).toEqual([
      { state: 'acknowledged' },
    ]);
  });
});
