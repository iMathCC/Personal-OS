# Deployment

## Objetivo
Preparar publicação reproduzível no Cloudflare Workers (Free, R$ 0), com mesmo Worker servindo SPA + `/api/v1/*` + D1.

## Pré-condições locais (obrigatórias antes de qualquer deploy)
1. Checkout limpo/reproduzível do candidato aprovado.
2. `npm ci`
3. `npm run format:check && npm run lint && npm run typecheck`
4. `npm test`
5. `npm run test:integration`
6. `npm run build`
7. `npm run db:generate` (sem drift inesperado)
8. `npm run backup:drill`
9. `npm audit --audit-level=high`
10. `npm run deploy:check` (requer `wrangler.production.toml` gerado)

## Preparação de configuração
- Modelo: `apps/api/wrangler.toml` (versionado, placeholders).
- Gerar efetiva: `RP_ID`, `ORIGIN`, `D1_DATABASE_ID` -> `npm run deploy:prepare`.
- Validar: `npm run deploy:check`.
- Dry-run: `npx wrangler deploy --config apps/api/wrangler.production.toml --dry-run`.

## Recursos Cloudflare necessários (Free)
- Workers (1 worker, `workers_dev=true`).
- D1 (1 database `personal-os`, binding `DB`).
- Assets estáticos via Worker Assets.
- Observabilidade/logs conforme Free; sem serviços pagos.

## Procedimento remoto (SOMENTE COM AUTORIZAÇÃO EXPLÍCITA)
1. Confirmar conta Free, sem billing ativo.
2. `wrangler whoami` (conta correta).
3. Criar D1 se inexistente: `wrangler d1 create personal-os`.
4. Definir secrets: `SETUP_TOKEN`, `CSRF_SECRET`, `IP_HASH_SALT` via `wrangler secret put`.
5. Aplicar migrations remotas em workflow aprovado: `wrangler d1 migrations apply DB --remote --config apps/api/wrangler.production.toml`.
6. Deploy: `npm run deploy`.
7. Verificação pós-deploy: `/api/v1/health` 200 + headers segurança, `/` SPA, deep link, auth/csrf, sem vazamento de cache API, D1 ok.

## Verificação pós-deploy
- `GET /api/v1/health` retorna 200 com `{status:"ok", db:"ok", version, time}` (contrato simples, sem `ready/checks` granulares); sem info sensível. Em degradação, 503 com `status="degraded"` e `db="unavailable"`.
- Headers: `Cache-Control: no-store` em API, HSTS, CSP, `X-Content-Type-Options: nosniff`.
- SPA fallback funcional; `/api/*` não cai em HTML.
- Login/setup apenas com autorização e token seguro; não registrar passkey sem decisão.

## Rollback
- Preferir rollback por versão/artefato conhecido do Worker (Cloudflare versioning/deploy anterior) se disponível; caso contrário redeploy do commit conhecido.
- Migrations D1 não são automaticamente reversíveis; antes de migration remota, export/backup e plano de compatibilidade.
- Em falha de saúde pós-deploy: parar promoção, avaliar logs, rollback de código; não "corrigir" com escrita manual em dados sem backup.

## Bloqueios atuais
- `apps/api/wrangler.production.toml` ausente por desenho (gitignored). Geração requer valores reais e autorização para uso remoto.
- CI remoto não executado neste candidato.
- Nenhum deploy remoto executado/autorizado por esta entrega.
