-- Entrega 23 — G1: `INSERT OR REPLACE` pode apagar uma reserva ou um resultado
-- sem disparar as guardas de DELETE/UPDATE. Estas triggers cobrem a substituição
-- silenciosa. As gravações legítimas usam `INSERT ... SELECT ... WHERE NOT EXISTS`,
-- que não produz linha quando a chave já existe e, portanto, não dispara a guarda.
CREATE TRIGGER `idempotency_key_reservations_no_replace`
BEFORE INSERT ON `idempotency_key_reservations`
WHEN EXISTS (SELECT 1 FROM `idempotency_key_reservations` WHERE `key` = NEW.key)
BEGIN
  SELECT RAISE(ABORT, 'idempotency_key_reservations is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `operation_results_no_replace`
BEFORE INSERT ON `operation_results`
WHEN EXISTS (SELECT 1 FROM `operation_results` WHERE `key` = NEW.key)
BEGIN
  SELECT RAISE(ABORT, 'operation_results is append-only');
END;
