import seedSql from '../../../../packages/db/src/seed.sql?raw';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyCurrentSchema,
  applyDecisionSchema,
  applyIndexAlignmentMigration,
  executeSql,
  first,
  indexNames,
  resetDatabase,
  run,
} from './helpers';

const BATCH_ID = '01f20000-0000-7000-8000-000000000010';

describe('migração 0010 — alinhamento de índices', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('instala do zero sem duplicar o índice de auditoria', async () => {
    await applyCurrentSchema();
    await executeSql(seedSql);

    const auditIndexes = await indexNames('audit_log');
    expect(auditIndexes).toContain('idx_audit_request_entity');
    expect(auditIndexes.filter((name) => name === 'idx_audit_request_entity')).toHaveLength(1);
    expect(await indexNames('life_import_batches')).toContain('idx_life_import_batches_source_id');
  });

  it('faz upgrade a partir da 0009 preservando dados', async () => {
    await applyDecisionSchema();
    await executeSql(seedSql);
    await run(
      `INSERT INTO audit_log (entity_type, entity_id, action, actor_type, request_id)
       VALUES ('life_import_batch', '${BATCH_ID}', 'import', 'system', 'req_index_alignment')`,
    );
    await run(
      `INSERT INTO life_import_batches
        (id, domain, format, total, imported, invalid, duplicates, source_id)
       VALUES ('${BATCH_ID}', 'finance_accounts', 'csv', 2, 1, 1, 0, 'src_import')`,
    );

    expect(await indexNames('audit_log')).toContain('idx_audit_request_entity');
    expect(await indexNames('life_import_batches')).not.toContain(
      'idx_life_import_batches_source_id',
    );

    await applyIndexAlignmentMigration();
    await executeSql(seedSql);

    expect(await indexNames('life_import_batches')).toContain('idx_life_import_batches_source_id');
    expect(
      await first<{ entity_id: string }>(
        "SELECT entity_id FROM audit_log WHERE request_id = 'req_index_alignment'",
      ),
    ).toEqual({ entity_id: BATCH_ID });
    expect(
      await first<{ id: string }>('SELECT id FROM life_import_batches WHERE id = ?', BATCH_ID),
    ).toEqual({ id: BATCH_ID });
  });
});
