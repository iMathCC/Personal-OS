# Runbook — backup e restauração verificável de D1

A estratégia geral está em [ADR-0010](../decisions/0010-backup-e-exportacao.md) e em `SECURITY.md` §9. Este runbook registra o mecanismo implementado na Entrega 6 e o drill executado.

## 1. Política de dados

O backup lógico usa uma **allowlist** de 15 tabelas de domínio. Por política, **não** são exportadas: `auth_challenges`, `idempotency_keys`, `rate_limits`, `recovery_codes`, `recovery_tokens` e `sessions`. Restaurar um backup, portanto, não reconstrói sessões nem credenciais de recuperação: o acesso é feito depois com passkey/código vigente.

O diretório de backup contém:

- `data.sql` — dados das tabelas da allowlist;
- `schema.sql` — schema completo (sem dados);
- `manifest.json` — `backupVersion`, timestamp, contagens por tabela, migrações aplicadas e SHA-256 dos arquivos.

## 2. Comandos

```bash
# Backup local (padrão). Saída em backups/d1-<timestamp>/
npm run backup:d1 -- --out backups/meu-backup

# Backup remoto exige autorização explícita e ID real já configurado:
npm run backup:d1 -- --mode remote --allow-remote \
  --config apps/api/wrangler.production.toml --out backups/remoto

# Restauração: SOMENTE em banco vazio; valida checksum e allowlist antes de qualquer escrita
npm run restore:d1 -- --from backups/meu-backup

# Drill completo em ambiente isolado (sem tocar em dados reais)
npm run backup:drill
```

`--mode remote` e `--allow-remote` são guardas separadas: nenhuma operação remota acontece por acidente. A restauração aborta se o banco de destino tiver qualquer tabela de domínio com dados.

## 3. Verificação

A restauração é considerada válida apenas quando:

1. o SHA-256 de `data.sql` confere com o manifest;
2. a lista de tabelas do manifest confere com a allowlist;
3. as contagens por tabela conferem com o manifest;
4. não há violações de foreign key;
5. os 11 triggers esperados estão presentes;
6. nenhuma das tabelas sensíveis excluídas foi restaurada;
7. seeds reaplicados são idempotentes (sem duplicatas).

O resultado é gravado em `restore-verification.json` dentro do diretório do drill/backup.

## 4. Drill Executado na Entrega 6

- Ambiente: `/tmp/opencode/personal-os-drill-eRE495` (isolado, descartável).
- Etapas: migrations `0000`–`0002` em banco vazio → upgrade `0003` com dados e seeds idempotentes → export de 15 tabelas/25 linhas → destruição do banco isolado → reaplicação das migrations → restauração → verificação → reexecução dos seeds.
- SHA-256 de `data.sql`: `b7aa285ae0a8a61a49ffbb64e44328cd84f7e7f5dd1d5b7ffed32a36eb092dc6`.
- Resultado: 15 tabelas restauradas, 0 violações de FK, 11/11 triggers, nenhuma tabela sensível restaurada, checksum de ida e volta igual, `audit_log` = 1, `passkeys` = 1.
- Evidências: `manifest.json`, `restore-verification.json` e `drill-summary.json` no diretório do drill.

O drill usa apenas bancos isolados. Nenhum dado real foi exportado, apagado ou restaurado. Repetir trimestralmente e após qualquer mudança de schema.
