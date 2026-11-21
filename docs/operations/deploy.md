# Runbook — configuração e deploy do Worker

Este runbook cobre a preparação local/isolada e o que **deve** acontecer no deploy. Nenhum deploy público, domínio, DNS ou recurso Cloudflare remoto foi executado na Entrega 6: essas ações exigem autorização humana explícita.

## 1. Pré-requisitos

- Node 24 (`engines.node >=24 <25`) e npm 11; `.nvmrc` fixado.
- `npm ci`.
- Verificações locais verdes:

```bash
npm run check
npm run test:integration
npm run build
npm run test:e2e:env -- --reset   # ambiente isolado em /tmp/opencode/browser-env
npm run test:e2e                  # Chromium + Firefox
```

O teste E2E usa HTTPS local autoassinado em `https://localhost:8788` com `RP_ID = localhost`. Isso é uma fimulação de dispositivo local — não enfraquece WebAuthn em produção e não altera `RP_ID`/`ORIGIN` reais.

## 2. Modelo de configuração

`apps/api/wrangler.toml` é apenas um **modelo** com placeholders (`REPLACE_WITH_RP_ID`, `REPLACE_WITH_ORIGIN`, `REPLACE_WITH_D1_DATABASE_ID`). O Wrangler **não** interpola `${VAR}` nesse arquivo, então a config efetiva é gerada com valores públicos vindos do ambiente:

```bash
export RP_ID=os.example.com
export ORIGIN=https://os.example.com
export D1_DATABASE_ID=<id-do-banco-criado-no-cloudflare>
npm run deploy:prepare   # gera apps/api/wrangler.production.toml (modo 0600, gitignored)
npm run deploy:check     # valida placeholders, assets, bindings e observabilidade
npx wrangler deploy --config apps/api/wrangler.production.toml --dry-run
```

`--dry-run` valida o bundle e os bindings **sem** criar ou publicar nada. Na Entrega 6 foi executado com valores sintéticos (`RP_ID=os.example.com`, `ORIGIN=https://os.example.com`, `D1_DATABASE_ID=3f5d8c2a-7b19-4c33-9f0e-2a6b8d4e1c70`) e passou.

### Segredos

`[secrets].required` declara `SETUP_TOKEN`, `CSRF_SECRET` e `IP_HASH_SALT`. Os valores **nunca** entram no arquivo de config nem no Git; em produção devem ser definidos no Worker com:

```bash
npx wrangler secret put SETUP_TOKEN --config apps/api/wrangler.production.toml
npx wrangler secret put CSRF_SECRET --config apps/api/wrangler.production.toml
npx wrangler secret put IP_HASH_SALT --config apps/api/wrangler.production.toml
```

`RP_ID` e `ORIGIN` são públicos e estáveis: devem ser decididos **antes** do primeiro cadastro de passkey. Trocá-los depois exige re-registro das credenciais.

### Assets e roteamento

```toml
[assets]
directory = "../web/dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = ["/api/*"]
```

O mesmo roteamento é usado pela config local de exemplo (`apps/api/wrangler.local.example.toml`), de modo que deep links e fallback SPA sejam idênticos em dev e produção.

## 3. Observabilidade

- `enabled = true`, `head_sampling_rate = 1`, `redact_query_string = true`.
- `logs.invocation_logs = false` (evita registro automático de request/response); `traces.enabled = false`.
- Logs da aplicação são estruturados: `requestId`, `method`, `path` **sem query string**, `status`, `durationMs` e `code` quando há erro.
- Nunca logar cookies, tokens, IP, User-Agent, corpo, notas, valores financeiros ou dados de saúde. Falhas de autenticação geram `auth_failure` e falhas de dependência `dependency_unavailable`, ambos sem PII.

## 4. Ordem de publicação (somente após autorização)

1. Aprovar `RP_ID`, `ORIGIN`, domínio e criação do banco D1.
2. Definir os três segredos no Worker remoto.
3. Aplicar migrações em workflow separado, com aprovação (nunca editar migração já aplicada).
4. `npm run deploy` (que roda `deploy:check` + `build` + `wrangler deploy` com a config gerada).
5. Verificar em produção: `/api/v1/health`, setup com `SETUP_TOKEN`, passkey em dois dispositivos reais, headers, CSP, recuperação, revogação, export e restauração.
6. Rotacionar `SETUP_TOKEN` após o bootstrap e registrar a data.

## 5. Estado da Entrega 6

| Verificação | Resultado |
| --- | --- |
| `npm run deploy:prepare` com valores sintéticos | OK |
| `npm run deploy:check` | OK |
| `wrangler deploy --dry-run` | OK, bindings corretos |
| `wrangler deploy` / D1 remoto / domínio / DNS | **Não executado** (bloqueado) |
