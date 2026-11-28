# Configuração de Ambiente

## Escopo
Documento operacional para configuração local, validação e preparação de produção do Personal OS (Cloudflare Workers + D1 + Assets estáticos). Não inclui segredos.

## Ambientes

| Ambiente | Config | Origem/RP | Uso | Estado remoto |
|---|---|---|---|---|
| Desenvolvimento local | `apps/api/wrangler.local.example.toml` / `wrangler.local.toml` (local) | `localhost` / `https://localhost:8787` ou conforme local | dev/test local | não aplicável |
| Teste E2E isolado | gerado por `scripts/prepare-browser-env.mjs` em `/tmp/opencode/browser-env` | `localhost` / `https://localhost:8788` | E2E isolado; não tocar 8788 manual do usuário | não aplicável |
| Produção (modelo) | `apps/api/wrangler.toml` | placeholders `REPLACE_WITH_*` | modelo versionado | não usar diretamente |
| Produção (efetiva) | `apps/api/wrangler.production.toml` (gitignored) | valores reais fornecidos por env | deploy/check | gerado localmente; deploy só com autorização |

## Variáveis e segredos

### Públicas / não secretas
- `APP_VERSION` — versão informativa.
- `RP_ID` — hostname registrável; **estruturante para passkeys**. Definir antes do primeiro cadastro.
- `RP_NAME` — nome exibido.
- `ORIGIN` — URL HTTPS exata, sem path/query/fragment.

### Segredos obrigatórios (Worker secrets, nunca em `[vars]`)
- `SETUP_TOKEN` — bootstrap inicial; rotacionar após uso.
- `CSRF_SECRET` — HMAC CSRF.
- `IP_HASH_SALT` — hash de IP para rate limit/diagnóstico sem PII bruta.

Declarados em `[secrets].required` no modelo; validados por `scripts/check-production-config.mjs`.

## Geração e validação

```bash
export RP_ID=personal-os.<subdominio>.workers.dev
export ORIGIN=https://personal-os.<subdominio>.workers.dev
export D1_DATABASE_ID=<uuid>
npm run deploy:prepare
npm run deploy:check
npx wrangler deploy --config apps/api/wrangler.production.toml --dry-run
```

Validações: placeholders ausentes, RP_ID/ORIGIN válidos e coerentes, UUID D1 válido, sem DB_TEST, bindings DB/ASSETS, SPA fallback, `/api/*` run_worker_first, secrets required, `redact_query_string=true`, HSTS em `apps/web/dist/_headers`, `preview_urls=false`.

## Valores que dependem do usuário/conta
- Subdomínio/hostname definitivo `workers.dev` ou domínio aprovado.
- `D1_DATABASE_ID` real (criado via `wrangler d1 create`, somente com autorização).
- Valores reais dos 3 secrets (gerados localmente, enviados via `wrangler secret put` com autorização).
- Confirmação de plano Free e ausência de billing.

## Operações que exigem autorização explícita
- Criar D1 remoto, aplicar migrations remotas, configurar/rotacionar secrets remotos, deploy, alteração DNS/domínio/rota, qualquer escrita remota Cloudflare.
