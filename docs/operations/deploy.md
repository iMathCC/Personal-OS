# Runbook — configuração e deploy do Worker

Este runbook cobre a preparação local/isolada e o que **deve** acontecer no deploy. Nenhum deploy público, domínio, DNS ou recurso Cloudflare remoto foi executado na Entrega 6: essas ações exigem autorização humana explícita.

Para publicação no endereço gratuito, use [free-deployment.md](free-deployment.md): ele detalha plano Free, `workers.dev`, RP ID completo, limites, classificação de custos, secrets, validação e desativação.

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

O teste E2E usa HTTPS local autoassinado em `https://localhost:8788` com `RP_ID = localhost`. Isso é uma simulação de dispositivo local — não enfraquece WebAuthn em produção e não altera `RP_ID`/`ORIGIN` reais.

`npm run test:e2e:env -- --reset` **apenas prepara** o ambiente (config, certificado, D1 isolado e seed). É preciso
iniciar o servidor antes de `npm run test:e2e`, usando o comando impresso pelo próprio script:

```bash
cd /tmp/opencode/browser-env && node /home/matheus/Projects/personal-OS/node_modules/wrangler/bin/wrangler.js dev \
  --config /tmp/opencode/browser-env/wrangler.browser.toml --port 8788 --local --local-protocol https \
  --https-key-path /tmp/opencode/browser-env/localhost.key \
  --https-cert-path /tmp/opencode/browser-env/localhost.crt
```

Se o servidor não estiver ativo, os testes falham com `ECONNREFUSED ::1:8788` / `ERR_CONNECTION_REFUSED`. Além
disso, o teste de autenticação cria a conta no D1 local e **não** a remove: para repeti-lo é necessário
`npm run test:e2e:env -- --reset` com o servidor parado. Sem reset, o setup responde `409 CONFLICT`.

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

## 6. Estado da Entrega 9 e publicação das mudanças de hardening

A versão publicada na Delivery 8 (`62f512ad-8778-4622-a787-979b3d5499be`) permanece em produção. A Entrega 9
preparou localmente, **sem publicar**:

- `Strict-Transport-Security: max-age=15552000; includeSubDomains` (sem `preload`) em HTML/assets via
  `apps/web/public/_headers` e em todas as respostas do Worker, inclusive 404/erros, via middleware `hsts`.
- `preview_urls = false` no modelo `apps/api/wrangler.toml` e na config efetiva gerada, preservando
  `workers_dev = true`, a URL principal, `RP_ID` e `ORIGIN`.
- Testes de regressão HSTS e validação do `_headers` no `deploy:check`.

Validações locais da Entrega 9: `npm run check` (34 domínio + 32 web + 82 API), integração D1 (24/24),
`deploy:check` (OK), `wrangler deploy --dry-run` (1868,70 KiB / 330,41 KiB gzip), E2E Chromium 7/7 e Firefox 6/6
+ 1 skip. Detalhes, limitações e rastreabilidade Git ↔ versão publicada em
[free-deployment.md](free-deployment.md) §15.

### Publicação somente após autorização explícita

1. Parar o servidor E2E local e confirmar HEAD/working tree revisados.
2. `npm run check && npm run test:integration && npm run build`.
3. `npm run deploy:prepare` com `RP_ID=personal-os.imathscc.workers.dev`,
   `ORIGIN=https://personal-os.imathscc.workers.dev` e o UUID real do D1 (já registrado no ambiente local);
   `npm run deploy:check` deve aprovar `preview_urls = false` e o HSTS no build.
4. `npx wrangler deploy --config apps/api/wrangler.production.toml --dry-run`.
5. Opcional e recomendado: `npm run backup:d1 -- --out backups/<data>` (local, sem dados remotos).
6. **Com autorização:** `npm run deploy`. Não recriar Worker/D1, não alterar migrations, não tocar segredos,
   não fazer push.
7. Pós-deploy: `curl -sSI` em `/` e `/api/v1/health` confirmando HSTS em ambos; conferir no output do Wrangler
   que o aviso de Preview URLs desapareceu; registrar a nova versão publicada neste runbook.
8. O registro real de passkey e o primeiro acesso continuam exigindo autorização separada e o `SETUP_TOKEN`,
   que não foi preservado localmente.
