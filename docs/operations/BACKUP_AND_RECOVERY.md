# Backup e Recuperação

## Objetivo
Garantir exportação, verificação e restauração lógica do D1 com integridade, sem corrupção silenciosa e sem expor dados sensíveis.

## Scripts
- `npm run backup:d1 -- --out <dir> [--config apps/api/wrangler.local.toml]`
- `npm run restore:d1 -- --in <dir> [--config ...] [--apply-seeds] [--allow-migrations-mismatch]`
- `npm run backup:drill` — drill isolado em diretório temporário.

## Escopo do backup
- Allowlist de tabelas de domínio/auditoria definida em `scripts/lib/d1-ops.mjs`.
- Excluídas por política: `auth_challenges`, `idempotency_keys`, `rate_limits`, `recovery_codes`, `recovery_tokens`, `sessions`.
- Manifest inclui versão, timestamp, migrations, tabelas, contagens, SHA-256.

## Procedimento de backup
1. Garantir ambiente alvo correto (local/remoto conforme autorização).
2. Executar `backup:d1` para diretório fora do repo/gitignored.
3. Conferir `manifest.json`, `schema.sql`, `data.sql`, contagens e checksum.
4. Armazenar em local seguro com controle de acesso; não commitar.

## Procedimento de restore (local/isolado primeiro)
1. **Nunca** restaurar direto em produção sem backup prévio e autorização.
2. Validar manifest/checksum (`restore:d1` faz prechecks).
3. Restaurar em banco vazio/isolado.
4. Verificar FKs, contagens, tabelas críticas, audit_log.
5. Reexecutar seeds idempotentes se aplicável.
6. Somente após validação, considerar restore remoto autorizado.

## Falhas tratadas / esperadas
- Arquivo corrompido/checksum divergente: restore deve falhar antes de mutação.
- Migrations divergentes: falha por padrão; override explícito apenas com entendimento do risco.
- Tabelas sensíveis excluídas: não restauradas; usuário deve reautenticar/gerar recovery codes.
- Interrupção: usar banco isolado; não presumir estado parcial como válido.

## Validação executada (evidência local)
- `npm run backup:drill` PASS no candidato D39/D40 (logs em `/tmp/opencode/d39/backup-drill.log`, resumo `/tmp/opencode/personal-os-drill-0YzkrL/drill-summary.json`).
- Drill cobre: migrations em banco vazio, upgrade com dados, export, destruição isolada, restauração, seeds idempotentes, falhas fechadas e origem somente leitura.

## Limitações
- Restore remoto/produção não executado nesta entrega (sem autorização).
- D1 Time Travel é complemento do provedor, não substitui export lógico validado.
- Recuperação após perda catastrófica depende de existência de backup externo recente.
