# Production Runbook

## 1. Propósito
Runbook operacional para preparar, validar, publicar (somente com autorização) e operar o Personal OS em Cloudflare Free com custo recorrente R$ 0.

## 2. Estado de prontidão
- **Preparado localmente**: build/testes/docs/config de modelo ok.
- **Preparado para produção**: config efetiva gerada, secrets planejados, D1/migrations planejados, dry-run ok.
- **Executado em produção**: deploy remoto autorizado realizado e verificado.
- **Monitorado em produção**: health/logs/limites verificados continuamente.

## 3. Pré-requisitos
- Node 24 / npm 11.
- Conta Cloudflare Free confirmada.
- Sem billing, sem recursos pagos.
- Autorização explícita para qualquer operação remota.

## 4. Checklist pré-deploy local
```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
npm run db:generate
npm run backup:drill
npm audit --audit-level=high
npm run deploy:prepare   # requer RP_ID, ORIGIN, D1_DATABASE_ID
npm run deploy:check
npx wrangler deploy --config apps/api/wrangler.production.toml --dry-run
```

## 5. Recursos e bindings
- Worker `personal-os`, `workers_dev=true`, `preview_urls=false`.
- D1 binding `DB`, database `personal-os`, migrations `apps/api/migrations`.
- Assets `apps/web/dist`, SPA fallback, `run_worker_first=["/api/*"]`.
- Secrets: `SETUP_TOKEN`, `CSRF_SECRET`, `IP_HASH_SALT`.

## 6. Deploy remoto (autorização explícita necessária)
1. Confirmar identidade da conta: `wrangler whoami`.
2. Confirmar plano Free e ausência de billing.
3. Criar D1 (se necessário): `wrangler d1 create personal-os`.
4. Gerar config efetiva com UUID real.
5. Configurar secrets via `wrangler secret put`.
6. Backup preventivo/export antes de alterações arriscadas.
7. Aplicar migrations remotas: `wrangler d1 migrations apply DB --remote --config apps/api/wrangler.production.toml`.
8. Deploy: `npm run deploy`.
9. Registrar versão/ID retornado.

## 7. Verificação pós-deploy
- `GET /api/v1/health` => 200, `status=ok`, `db=ok`, `ready=true`, checks ok.
- HSTS, CSP, `X-Content-Type-Options`, `Cache-Control: no-store` em API.
- SPA `/`, deep link, assets, manifest/sw.
- Auth CSRF endpoint responde; mutações sem CSRF/origem indevida bloqueadas.
- Não criar passkey real sem autorização.

## 8. Rollback
- Código: redeploy da versão/commit anterior conhecido.
- Schema: migrations não têm rollback automático; usar backup lógico validado e plano de compatibilidade.
- Se health degradado pós-deploy: interromper, coletar requestId/logs, avaliar rollback.

## 9. Operações proibidas sem autorização
- Deploy, migrations remotas, `wrangler secret put`, criação/remoção D1/Worker, alterações DNS/billing/conta, restore remoto.

## 10. Referências
- `docs/operations/DEPLOYMENT.md`
- `docs/operations/ENVIRONMENT_CONFIGURATION.md`
- `docs/operations/BACKUP_AND_RECOVERY.md`
- `docs/operations/INCIDENT_RESPONSE.md`
- `docs/operations/SECURITY_OPERATIONS.md`
- `docs/operations/free-deployment.md`
