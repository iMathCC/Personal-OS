-- `INSERT OR REPLACE` não disparou o trigger de DELETE no D1, permitindo
-- sobrescrever uma linha de auditoria existente. Este guard cobre esse caso.
CREATE TRIGGER `audit_log_no_replace`
BEFORE INSERT ON `audit_log`
WHEN EXISTS (SELECT 1 FROM `audit_log` WHERE `id` = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;
