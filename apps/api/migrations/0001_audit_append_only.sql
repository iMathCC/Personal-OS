-- Regras de integridade que o Drizzle Kit não expressa em SQL generativo.
-- Esta migração é imutável após aplicação, como qualquer outra.

-- auditoria é append-only. INSERT OR REPLACE também dispara o trigger de DELETE,
-- portanto não há brecha para reescrever uma linha já gravada.
CREATE TRIGGER `audit_log_no_update`
BEFORE UPDATE ON `audit_log`
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;

CREATE TRIGGER `audit_log_no_delete`
BEFORE DELETE ON `audit_log`
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;

-- Rede de segurança para o limite de 10 sessões ativas por usuário.
-- A revogação da sessão mais antiga e o INSERT da auditoria continuam sendo
-- feitos pela camada de aplicação, no mesmo db.batch(): o banco apenas aborta
-- quando o serviço esquece de aplicar a política. D1 é serial por banco, então
-- duas inserções concorrentes não escapam do limite.
CREATE TRIGGER `sessions_active_limit`
BEFORE INSERT ON `sessions`
WHEN NEW.revoked_at IS NULL AND (
  SELECT COUNT(*)
  FROM `sessions`
  WHERE `user_id` = NEW.user_id
    AND `revoked_at` IS NULL
    AND `expires_at` > (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) >= 10
BEGIN
  SELECT RAISE(ABORT, 'active session limit reached');
END;
