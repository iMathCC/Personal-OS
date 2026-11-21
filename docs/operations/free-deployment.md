# Publicação gratuita no `workers.dev` (R$ 0)

Este runbook cobre a publicação do Personal OS **somente com recursos gratuitos da Cloudflare**, no endereço
`https://<worker-name>.<account-subdomain>.workers.dev`. A decisão de custo recorrente R$ 0 é permanente: se um
recurso necessário deixar de caber no plano gratuito, **pare e peça autorização** — nunca faça fallback automático
para um plano pago.

Estado atual: a conta Cloudflare foi autenticada via OAuth, o subdomínio `imathscc` está ativo e o Worker
`personal-os` foi publicado em `https://personal-os.imathscc.workers.dev` (Delivery 8, versão
`62f512ad-8778-4622-a787-979b3d5499be`). O D1 `personal-os` existe com as migrations `0000`–`0003` aplicadas.
Os três segredos estão configurados **somente no Worker remoto**; valores não são registrados aqui nem no Git.
O plano Free foi confirmado pelo usuário no Dashboard. A configuração efetiva
`apps/api/wrangler.production.toml` (gitignored) contém o UUID real do D1 e `RP_ID`/`ORIGIN` do hostname publicado.
O estado detalhado da Entrega 9 — incluindo hardening local ainda não publicado — está na §15.

## 1. Arquitetura de publicação gratuita

```
Navegador / PWA  --HTTPS-->  workers.dev (rota gratuita do Worker "personal-os")
                              ├── assets estáticos (apps/web/dist): SPA + shell da PWA
                              └── /api/* no mesmo Worker: Hono + D1 (binding "DB")
```

- **Um único Worker** (`name = "personal-os"`, `workers_dev = true`) serve frontend e API. Não há microsserviços,
  filas, segundo Worker, domínio próprio, DNS, certificado próprio, R2, KV, Durable Objects nem provedores externos.
- `apps/api/wrangler.toml` é o **modelo** com placeholders. `npm run deploy:prepare` gera a config efetiva
  (modo `0600`, gitignored) e `npm run deploy:check` valida placeholders, bindings, assets e observabilidade.
- Assets: `directory = "../web/dist"`, `not_found_handling = "single-page-application"` e
  `run_worker_first = ["/api/*"]`. A API passa primeiro pelo Worker; deep links caem no `index.html`.
- Segurança: CSP e headers rígidos permanecem; respostas de API usam `Cache-Control: no-store, no-cache,
  must-revalidate`; a PWA precacheia somente o shell. Cookie de sessão `__Host-pos_session` com `Secure`, `HttpOnly`
  e `SameSite` apropriado; toda mutação exige sessão + CSRF.
- **WebAuthn neste endereço:** `workers.dev` consta na Public Suffix List. Portanto, o domínio registrável é o
  hostname completo de três rótulos. Use `RP_ID = personal-os.<subdominio>.workers.dev` (hostname completo, sem
  esquema, porta ou caminho) e `ORIGIN = https://personal-os.<subdominio>.workers.dev` (exato, HTTPS, sem `/` final,
  query ou fragmento). Não use apenas `<subdominio>.workers.dev` como RP ID.
- A validação é rigorosa e não foi flexibilizada: `expectedRPID` vem de `RP_ID`, `expectedOrigin` da lista exata
  derivada de `ORIGIN`, com `requireUserPresence` e `requireUserVerification`. Credenciais ficam vinculadas ao RP ID:
  **decida o hostname definitivo antes do primeiro cadastro de passkey**. Trocá-lo depois exige re-registro.

## 2. Como autenticar o Wrangler

No terminal do usuário (nunca cole credenciais no chat nem as grave no repositório):

```bash
npx wrangler login
npx wrangler whoami
```

`login` abre o navegador para autorizar o CLI; `whoami` confirma a conta ativa. Para automação sem navegador, use
variáveis de ambiente injetadas pelo shell/CI (fora do Git):

```bash
export CLOUDFLARE_API_TOKEN='<token-com-permisso-minima>'
export CLOUDFLARE_ACCOUNT_ID='<account-id>'
npx wrangler whoami --json     # saída local: contém identificadores da conta
```

Não compartilhe a saída de `whoami --json`, tokens ou IDs em relatórios, issues ou commits. Se `whoami` falhar,
interrompa as etapas remotas; nada neste runbook precisa de token para ser lido ou preparado localmente.

## 3. Como verificar o plano Free

Sem alterar nada na conta:

1. Abra o [Cloudflare Dashboard](https://dash.cloudflare.com/) → página inicial da conta.
2. Confira o selo de plano da conta: deve ser **Free**, sem assinatura de Workers Paid nem outros planos pagos.
3. Em **Billing / Plan**, confirme que não há método de pagamento, renovação paga nem upgrade pendente.
4. Não clique em botões de upgrade, não adicione cartão e não habilite Billing.

Se a conta não estiver no Free, **pare**: a publicação com R$ 0 não é possível naquele estado. Não faça downgrade,
compra ou alteração de cobrança sem autorização explícita.

## 4. Como habilitar e conferir `workers.dev`

1. Dashboard → **Workers & Pages** → ao lado de **Your subdomain**, confira o subdomínio da conta (`Change` apenas
   se for necessário e autorizado). Anote o valor localmente; não publique identificadores da conta.
2. O nome do Worker vem de `name = "personal-os"` no `wrangler.toml`. A rota resultante será
   `https://personal-os.<subdominio>.workers.dev`. O nome precisa ter no máximo 63 caracteres, usar apenas letras,
   números e hífens, e não começar/terminar com hífen. Se o nome estiver ocupado, escolha outro antes de gerar a
   config e ajuste `name` no modelo — o `database_name` do D1 permanece `personal-os`.
3. Confira a disponibilidade sem criar nada: o próprio `npx wrangler deploy --dry-run` valida o bundle e os bindings;
   a disponibilidade real do nome e do subdomínio só é confirmada no deploy autorizado.
4. Após o deploy (autorizado), teste `curl -i https://personal-os.<subdominio>.workers.dev/api/v1/health` com um
   User-Agent descritivo. O `workers.dev` aplica Browser Integrity Check gerenciado pela Cloudflare, que não pode
   ser desligado pelo projeto; clients automatizados com User-Agent genérico podem receber `1010` antes do Worker.
5. Atenção: desativar a rota apenas no Dashboard e manter `workers_dev = true` no arquivo faz a rota voltar no
   próximo deploy (ver §14).

## 5. Como preparar as variáveis de produção

RP_ID e ORIGIN são públicos, mas **estruturantes**: devem ser os definitivos antes do primeiro cadastro de passkey.
O `D1_DATABASE_ID` vem da criação autorizada do banco (§7).

```bash
export RP_ID=personal-os.<subdominio>.workers.dev
export ORIGIN=https://personal-os.<subdominio>.workers.dev
export D1_DATABASE_ID=<uuid-retornado-por-wrangler-d1-create>

npm run deploy:prepare
npm run deploy:check
npx wrangler deploy --config apps/api/wrangler.production.toml --dry-run
```

`deploy:prepare` rejeita placeholders, RP_ID local, ORIGIN HTTP, host diferente do RP_ID, caminhos/query/fragmento e
UUID inválido. O arquivo gerado é gitignored; nunca comite `wrangler.production.toml`, `.dev.vars` ou `.env*`.

Valores **sintéticos** usados nesta preparação (somente para validação, jamais para passkeys reais):
`RP_ID=personal-os.example.workers.dev`, `ORIGIN=https://personal-os.example.workers.dev` e
`D1_DATABASE_ID=3f5d8c2a-7b19-4c33-9f0e-2a6b8d4e1c70`. `deploy:check` e `--dry-run` passaram com eles.

## 6. Como configurar os secrets com `wrangler secret put`

Os três segredos obrigatórios declarados em `[secrets].required` devem existir no Worker remoto antes de tráfego
real. Gere cada valor localmente e cole quando o comando pedir (não use valores de exemplo em produção):

```bash
openssl rand -base64 32    # executar 3 vezes: um valor para cada secreto

npx wrangler secret put SETUP_TOKEN --config apps/api/wrangler.production.toml
npx wrangler secret put CSRF_SECRET --config apps/api/wrangler.production.toml
npx wrangler secret put IP_HASH_SALT --config apps/api/wrangler.production.toml
```

- Nunca defina esses nomes em `[vars]`; `deploy:check` falha se encontrá-los no arquivo.
- `SETUP_TOKEN` é de bootstrap: após criar o usuário, rotacione-o e registre a data em local seguro.
- Criar ou modificar secrets na Cloudflare exige autorização explícita; esta tarefa não executou nenhum desses
  comandos contra a conta remota.

## 7. Como criar D1 somente após autorização

A aplicação usa **um** banco D1 chamado `personal-os`. Com autorização explícita:

```bash
npx wrangler d1 create personal-os
```

O comando retorna o `database_id`; use-o em `D1_DATABASE_ID` (§5) e gere novamente a config. Não crie bancos
adicionais, réplicas, backups remotos em R2 nem recursos pagos. O ID real não deve aparecer em documentação, commits ou
relatórios. Nesta preparação nenhum banco remoto foi criado.

## 8. Como executar migrations

Localmente, as migrations `0000`–`0003` já foram validadas do zero e em upgrade (drill da Entrega 6). A aplicação em
banco vazio usa esta ordem: `0000` → `0001` → `0002` → `0003`.

Somente com autorização e após a criação do D1 remoto, em workflow separado e aprovado:

```bash
npx wrangler d1 migrations apply DB --remote --config apps/api/wrangler.production.toml

# Conferência somente leitura (ainda exige conta autenticada):
npx wrangler d1 execute DB --remote --config apps/api/wrangler.production.toml \
  --command "SELECT name FROM d1_migrations ORDER BY name;"
```

Nunca edite uma migration já aplicada; correções viram uma nova migration. Nunca use `DB_TEST` em produção. Nesta
preparação nenhuma migration remota foi aplicada.

## 9. Como realizar o deploy

Pré-condições locais (todas executáveis sem recursos remotos):

```bash
npm ci
npm run check
npm run test:integration
npm run backup:drill
npm audit --audit-level=high
npm run deploy:check
```

Com a conta autenticada, os segredos definidos, o D1 criado e as migrations aplicadas — e **após autorização
explícita para publicar**:

```bash
npm run deploy
```

`npm run deploy` roda `deploy:check` + `build` + `wrangler deploy --config apps/api/wrangler.production.toml`. Não
configure `routes`, `custom_domains`, `zone_id` nem DNS: a rota `workers.dev` já vem de `workers_dev = true`. O
`--dry-run` desta preparação confirmou os bindings `DB`, `ASSETS`, `APP_VERSION`, `RP_ID`, `RP_NAME` e `ORIGIN` e
leu 14 arquivos de assets. Nenhum deploy público foi executado aqui.

## 10. Como validar login, passkeys, sessões, recuperação e PWA

Validação em produção (somente após o deploy autorizado):

1. **Health e headers:** `curl -i https://personal-os.<subdominio>.workers.dev/api/v1/health` → 200, envelope
   `{ data, meta }`, `Cache-Control: no-store, no-cache, must-revalidate` e CSP sem relaxamento. Confirme que a
   URL é exatamente o `ORIGIN` configurado.
2. **Setup:** use `SETUP_TOKEN` uma vez pela interface; em seguida rotacione o token. Não registre passkeys com a
   config sintética destes testes.
3. **Passkeys:** registre em dispositivo real; confirme nas opções de `navigator.credentials.create` que `rp.id`
   é o hostname completo e que a origem da requisição é exata. Teste login no mesmo dispositivo e, se aplicável,
   em outro com sincronização de passkeys; verifique falha de origem/RP ID diferente (não deve autenticar).
4. **Sessões e CSRF:** confirme `__Host-pos_session` com `Secure`/`HttpOnly`/`SameSite`, expiração e limite de
   sessões ativas; toda mutação com Origin ausente/diferente ou CSRF inválido deve ser rejeitada.
5. **Recuperação:** gere códigos de recuperação, armazene-os fora do repositório e teste o fluxo. Eles **não** entram
   no backup lógico (§13).
6. **PWA:** instale o app, abra deep links, ative offline e recarregue — o shell abre, mas nenhuma resposta de API
   é servida do cache; não há escrita offline. Confira foco/teclado e 360–1920 px.
7. **Auditoria:** mutações devem aparecer no `audit_log` com proveniência (`source_id`, `confidence` quando aplicável,
   `algorithm_version` em cálculos).

## 11. Como monitorar limites gratuitos

| Recurso | Limite Free relevante | Comportamento ao exceder | Onde conferir |
| --- | --- | --- | --- |
| Workers | 100.000 requisições/dia (reset 00:00 UTC); 10 ms CPU/invocação; 50 subrequests/requisição | Erro `1027` (dia), `1102` (CPU) ou falha de subrequest. **Não gera cobrança** | Dashboard → Worker → Metrics/Errors; `npx wrangler tail` |
| Assets estáticos | Requisições gratuitas e ilimitadas; 20.000 arquivos/versão; 25 MiB por arquivo | Deploy falha se exceder contagem/tamanho; tráfego não cobra | Dashboard → Worker → Assets |
| D1 | 5 M linhas lidas/dia; 100.000 linhas escritas/dia; 500 MB por banco; 5 GB por conta; 10 bancos; 50 queries/invocação | API D1 retorna erro; reset 00:00 UTC; **upgrade não é automático** | Dashboard → D1 → `personal-os` → Metrics > Row Metrics |
| Workers Logs (até 01/12/2026) | 200.000 eventos/dia; 3 dias de retenção | Eventos excedentes deixam de ser registrados | Dashboard → Worker → Logs |
| Observability Free (desde 01/12/2026) | 0,5 GB/dia de ingestão; 7 dias de retenção; storage adicional sem cobrança | Ingestão para até o limite e retoma às 00:00 UTC; não há compra de ingestão extra no Free | Dashboard → Observability |
| Billing | Nenhum plano pago contratado | Qualquer tentativa de upgrade exige decisão humana | Dashboard → Billing / Plan |

O consumo real em produção ainda não foi medido; as medições locais da Entrega 6 estão em
[local-measurements.md](local-measurements.md). Ao usar `wrangler tail`, filtre e nunca registre cookies, tokens,
notas, valores financeiros ou dados de saúde.

## 12. Como evitar cobranças

Classificação de todos os serviços e recursos auditados:

| Recurso | Uso no Personal OS | Classe | Limite/condição que protege o R$ 0 |
| --- | --- | --- | --- |
| Workers | 1 Worker, API + roteamento | Gratuito dentro das cotas | 100 k req/dia, 10 ms CPU; excesso = erro, nunca fatura |
| Workers Static Assets | Frontend, PWA, `_headers` | Gratuito com limites | Requisições ilimitadas; 20 k arquivos/versão; 25 MiB/arquivo |
| D1 | 1 banco `personal-os`, migrations 0000–0003 | Gratuito dentro das cotas | 5 M leituras e 100 k escritas/dia, 500 MB/banco, 5 GB/conta, 10 bancos |
| Workers Logs / Observability | Logs estruturados, `invocation_logs = false`, traces desligados | Gratuito com limites ou condições | 200 k eventos/3 dias até 01/12/2026; 0,5 GB/7 dias depois; sem upgrade pago |
| Workers KV | **Não usado** | Gratuito com limites | Não criar namespace; inclusion no Free não autoriza uso descuidado |
| R2 | **Não usado** (backups ficam em arquivos locais) | Gratuito com limites, mas evitado | Não criar bucket; backup remoto só com autorização |
| Durable Objects, Queues, Vectorize, Containers, Logpush, Hyperdrive, Pages Functions | **Não usados** | Pago ou potencialmente cobrável | Nunca habilitar; nenhum binding no config |
| Domínio, DNS, certificado próprio, Custom Domain | **Não usados** | Pago (domínio) / potencialmente cobrável | `workers_dev = true`; não comprar domínio nem configurar DNS |
| Workers Paid / Billing | **Não contratado** | Pago | Não habilitar Billing, cartão, upgrade ou spending automático |
| IA externa / APIs de terceiros | **Não usadas** | Potencialmente cobrável | Nenhuma chave, nenhum provedor; app funciona sem IA |
| Build e deploy local (`npm`, `wrangler`) | Usado | Gratuito | Nenhum CI pago contratado; `deploy` usa apenas Wrangler gratuito |

Regras operacionais:

- Manter a conta no plano **Free** e sem método de pagamento; não aceitar upgrades sugeridos pelo Dashboard.
- Não criar recursos fora da tabela acima; todo novo binding/dependência passa por justificativa e ADR.
- Exceder cota no Free produz **erro na aplicação**, nunca cobrança automática. Não existe fallback para plano pago.
- Configurar um *Workers spending limit* seria uma proteção adicional, mas é alteração remota da conta: somente com
  autorização e sem habilitar Billing.
- O sistema não envia dados para IA externa nem executa recomendações automáticas.

## 13. Como fazer backup e restore

Procedimento completo e evidências do drill em [restore-drill.md](restore-drill.md) e [ADR-0010](../decisions/0010-backup-e-exportacao.md).

```bash
npm run backup:drill                                  # isolado, sem dados reais
npm run backup:d1 -- --out backups/meu-backup         # backup lógico local
npm run backup:d1 -- --mode remote --allow-remote \
  --config apps/api/wrangler.production.toml --out backups/remoto   # exige autorização
npm run restore:d1 -- --from backups/meu-backup       # somente em banco vazio
```

- Allowlist de 15 tabelas de domínio/auditoria; `schema.sql` + `manifest.json` com SHA-256 e contagens.
- **Não** entram no backup: `sessions`, `recovery_codes`, `recovery_tokens`, `auth_challenges`, `idempotency_keys`
  e `rate_limits`. O usuário guarda os códigos de recuperação separadamente.
- D1 Free oferece Time Travel de 7 dias como complemento; usar restore remoto é operação potencialmente destrutiva e
  exige autorização, exportação prévia e confirmação.
- Repetir o drill trimestralmente e após qualquer mudança de schema. Nenhum backup remoto foi criado nesta tarefa.

## 14. Como desativar a publicação

Somente com autorização explícita e **depois** de exportar/backup confirmado:

1. Dashboard → **Workers & Pages** → Worker `personal-os` → **Settings** → **Domains & Routes** → `workers.dev` →
   **Disable**. Isso remove a URL pública, mas mantém version/preview URLs e o banco.
2. Para que a desativação sobreviva a um novo deploy, ajuste o modelo `apps/api/wrangler.toml` para
   `workers_dev = false`, rode `npm run deploy:prepare` e `npm run deploy:check`. Se o Dashboard estiver desativado
   e o arquivo continuar `workers_dev = true`, o próximo deploy reativa a rota.
3. Para encerrar de fato (destrutivo, irreversível sem backup):
   `npx wrangler delete personal-os --config apps/api/wrangler.production.toml`.
4. Para remover o banco (destrutivo; exige confirmação e export): `npx wrangler d1 delete personal-os`.
5. Rotacione `SETUP_TOKEN` e quaisquer segredos que tenham circulado; confirme que a conta permanece no Free e sem
   cobrança. A remoção do Worker remove também seus secrets.
6. Nenhuma dessas operações foi executada nesta preparação.

## 15. Estado da Entrega 9 — hardening local (sem deploy)

Esta seção registra o que foi preparado na Entrega 9 e **publicado na Entrega 10**. Até a Delivery 9 as mudanças
eram locais e a versão em produção era `62f512ad-8778-4622-a787-979b3d5499be`; o estado atual está na §16.

### 15.1 Política HSTS

- Valor adotado: `Strict-Transport-Security: max-age=15552000; includeSubDomains` (180 dias, acima do mínimo de
  seis meses da [SECURITY.md](../SECURITY.md)). **Sem `preload`** — a inclusão na lista do navegador é difícil de
  reverter e exigiria decisão separada.
- `includeSubDomains` é seguro aqui porque o hostname é dedicado (`personal-os.imathscc.workers.dev`) e não há
  outros subdomínios sob ele cuja política seria alterada. Não há domínio customizado na conta para este Worker.
- **Antes:** `/api/v1/health` e demais rotas da API já emitiam HSTS (o middleware `secureHeaders()` do Hono 4.13
  usa exatamente esse valor por padrão), mas o HTML e os assets servidos pelo Static Assets **não** emitiam — as
  regras em `apps/web/public/_headers` não continham a diretiva. A resposta HTML em produção confirmou a ausência.
- **Depois (publicado na Entrega 10):** `Strict-Transport-Security` consta em `apps/web/public/_headers` (aplicável a
  HTML e assets) e o Worker aplica o middleware `hsts` globalmente, cobrindo também `notFound` e erros que não
  passam pelos middlewares restritos a `/api/v1/*`. Nenhum header existente (CSP, `X-Content-Type-Options`,
  `Referrer-Policy`, `Cache-Control`, etc.) foi removido. Conferido em produção em `/`, health, 401, 403, 404 e
  asset estático.
- Evidência: `apps/api/test/security-headers.test.ts` cobre health, erro 403 e rota inexistente;
  `scripts/check-production-config.mjs` falha se `apps/web/dist/_headers` não contiver a diretiva.

### 15.2 Política de Preview URLs

- `preview_urls = false` foi adicionado ao modelo `apps/api/wrangler.toml` e está presente na config efetiva
  gerada. A versão instalada do Wrangler (4.166.0) suporta a propriedade.
- O objetivo é reduzir a superfície pública: URLs de preview temporárias de branches não são necessárias para
  uso pessoal. `workers_dev = true`, a URL principal, `RP_ID` e `ORIGIN` permanecem inalterados; nenhum domínio
  customizado foi criado e o roteamento de assets não mudou.
- **Efeito remoto aplicado na Entrega 10:** o deploy com `preview_urls = false` não emitiu o aviso que apareceu na
  Delivery 8 (“Because your 'workers.dev' route is enabled and your 'preview_urls' setting is not in your
  wrangler.production.toml, Preview URLs will be enabled for this deployment by default”). `workers_dev = true` e
  a URL principal seguem intactos.

### 15.3 Diagnóstico de CPU

- Amostra da Delivery 8: p50 ≈ 6,2 ms, p99 ≈ 16,1 ms em **15 requisições**, zero erros `1102`. O painel usa
  GraphQL em µs; os valores convertidos para ms são estimativas amostradas, não medição de billing nem prova de
  violação do limite de 10 ms/invocação.
- Revisão de código (sem carga em produção): os trabalhos síncrono/criptográfico relevantes são `crypto.randomUUID`
  por request, SHA-256 do IP em toda requisição, SHA-256 do token de sessão quando há cookie, HMAC-SHA-256 de CSRF
  em mutações, `JSON.parse`/Zod no corpo e verificação ECDSA P-256 **apenas** em `setup/verify`, `login/verify` e
  `recovery/register/verify`. Não há `SELECT *` em produção; as consultas usam colunas explícitas e índices.
- Inicialização estática (Hono, Zod, `@simplewebauthn/server`, dialect do Drizzle) é paga no cold start. É uma
  explicação plausível para um p99 alto em amostra pequena, **não uma causa comprovada**.
- Com 15 amostras, p99 equivale praticamente ao máximo: um único cold start explica 16,1 ms. O único instrumento
  do app mede latência de parede (`durationMs`), não CPU por rota, e não há medição de CPU p95 publicada.
  Amostragem adaptativa do painel não é verificável daqui.
- **Conclusão:** não há evidência suficiente para otimizar. Nenhuma mudança de performance foi feita; o gate de CPU
  do roadmap permanece aberto. Observações documentadas para medição futura: a validação de sessão roda em rotas
  públicas quando há cookie e `/auth/me` pode emitir 9 instruções SQL se o refresh de `last_seen` disparar
  (não se sabe se `batch()` conta como um span no explorer local).

### 15.4 Estado da validação da autenticação em produção

Executado contra `https://personal-os.imathscc.workers.dev` **sem registrar passkey e sem conhecer `SETUP_TOKEN`**:

| Verificação | Resultado |
| --- | --- |
| `GET /` (HTML publicado) | 200; HSTS ausente antes da correção (ver §15.1) |
| `GET /api/v1/health` | 200; HSTS presente |
| `GET /api/v1/auth/csrf` | 200; emite `pos_vid` e `pos_csrf`, nenhum cookie de sessão |
| `POST /auth/setup/options` com `X-Setup-Token` inválido | 403 `FORBIDDEN` — token não vazou, nenhuma challenge criada |
| `POST /auth/login/options` | 200; `rpId = personal-os.imathscc.workers.dev`, `userVerification = required`, 0 credenciais (conta ainda não existe) |
| `GET /auth/me` sem sessão | 401 `UNAUTHENTICATED` |
| `POST /auth/recovery/verify` com código inválido | 400 `VALIDATION_ERROR`; nenhuma sessão criada |
| Cookie `__Host-pos_session` | **não** emitido em nenhum probe |

O hostname publicado é compatível com WebAuthn (RP ID completo de três rótulos, conforme §1). **Não foi possível
validar o registro real sem criar credencial** — isso exige autorização explícita e o valor de `SETUP_TOKEN`.
Localmente, a jornada completa foi executada com autenticador virtual: Chromium 7/7 testes (incluindo setup, login,
estudos, logout, revogação e recuperação) e Firefox 6/6 + 1 skip (o autenticador virtual via CDP só existe no
Chromium). O teste E2E depende de `npm run test:e2e:env -- --reset` + servidor local ativo em
`https://localhost:8788`; sem o servidor, os testes falham com `ECONNREFUSED`.

### 15.5 Limitações conhecidas de produção

- A versão publicada **não contém** HSTS em HTML/assets nem `preview_urls = false` (§15.1, §15.2).
- Não há passkey registrada nem conta criada em produção; o fluxo real de primeiro acesso segue pendente.
- O valor de `SETUP_TOKEN` não foi preservado localmente após o bootstrap; ele existe apenas no Worker remoto.
  Para o primeiro acesso será necessário recuperá-lo de forma segura ou rotacioná-lo (rotação é mudança de segredo
  e exige autorização).
- A API de billing retorna `403 / erro 10000`, então método de pagamento/cobrança automática não é verificável
  por API; o plano Free foi confirmado pelo usuário no Dashboard.
- Divergências documentais corrigidas nesta entrega: `requestOrigin()` usa `Referer` como fallback apenas na
  comparação de origem (o token CSRF continua obrigatório) e o rate limit por usuário ainda não cobre `/studies/*`
  (ver [SECURITY.md](../SECURITY.md) §2.4 e §2.5).
- `recoveryVerify` revoga sessões no D1 mas não emite `clearSessionCookie`; o frontend trata o 401 resultante e
  limpa caches/CSRF. `loginOptions` com zero credenciais e mensagens distintas em `loginVerify` são oráculos
  limitados, mitigados pelo rate limit por IP.

### 15.6 Procedimento de deploy seguro (somente após autorização)

1. Confirmar que as mudanças locais foram revisadas e que os testes estão verdes (`npm run check`, integração D1,
   `npm run deploy:check`, dry-run, E2E local) e registrar o HEAD exato.
2. Fazer backup lógico local do D1 (`npm run backup:d1`) e conferir o manifesto/_SHA-256_. Nenhum restore é feito.
3. Gerar a config efetiva com `npm run deploy:prepare` (RP_ID/ORIGIN/UUID já conhecidos) e validar com
   `npm run deploy:check`. Conferir que `preview_urls = false` e `workers_dev = true` estão presentes.
4. `npx wrangler deploy --config apps/api/wrangler.production.toml --dry-run` como última checagem local.
5. **Somente com autorização explícita:** `npm run deploy`. Não criar recursos, não alterar migrations, não tocar
   em segredos, não fazer push.
6. Após publicar: verificar HTML e API com `curl -D`, confirmar HSTS em ambos, checar o aviso de Preview URLs no
   output, validar `/api/v1/health` e `/auth/csrf`, e registrar a nova versão retornada pelo Wrangler.
7. **Não** registrar passkey real sem autorização separada e sem o `SETUP_TOKEN` disponível de forma segura.

### 15.7 Rastreabilidade Git ↔ versão publicada

| Item | Valor |
| --- | --- |
| HEAD local (antes desta entrega) | `414d8fe46cf0557ecb892759bf2740c051d85690` |
| `origin/main` real (`git ls-remote`) | `19c0571467bba93af3adff5a82a141cefdec3f1f` |
| Divergência | `9 0` — nove commits apenas locais, **nenhum** commit exclusivo remoto |
| Merge-base | `19c0571467bba93af3adff5a82a141cefdec3f1f` |
| Versão publicada (Delivery 8) | `62f512ad-8778-4622-a787-979b3d5499be` |
| Código publicado | corresponde ao estado local ao final da Delivery 8; os nove commits locais incluem aquele estado |
| Push / merge / rebase / reset | **não executados** |

A divergência não foi resolvida automaticamente. Os nove commits exclusivos locais são, do mais antigo ao mais
recente: `1bf09d5` (schema e migration 0003), `26c8ba2` (regras de studies), `995438a` (módulo studies na API),
`d3ada1a` (página de estudos), `1fac1e6` (documentação das entregas 5–6), `080301b` (no-store e observabilidade),
`fa5e82b` (config de deploy guardada, drill de backup e E2E), `cc86bce` (runbooks e ADR-0014) e `414d8fe`
(runbook de publicação gratuita). O tracking local `origin/main` aponta para o merge-base, mas o remoto real
também está nesse commit — ou seja, o repositório remoto está 9 commits **atrás** do local, sem divergência de
histórico. A decisão de como sincronizar fica com o usuário.

## 16. Entrega 10 — sincronização, deploy e preparação do primeiro acesso

### 16.1 Git

- HEAD local e `origin/main` após o push: `5de3839a7bdcb4b0bd9521ddb597815606eb0c49` (árvore limpa, divergência `0 0`).
- Foram sincronizados os nove commits da Entrega 9 (`1bf09d5` … `414d8fe`) **mais** o commit `5de3839`, que
  versionou o hardening HSTS/Preview URLs e a documentação da Entrega 9 — necessário para publicar essas mudanças
  e deixar a árvore limpa. Push normal (`git push origin main`), sem force, sem merge/rebase/reset.
- Verificação de secrets: nenhum valor real no histórico; somente placeholders `REPLACE_WITH_*` e valores dummy
  explícitos de teste (`browser-setup-token`, `browser-csrf-secret-not-for-production`,
  `browser-ip-salt-not-for-production`). `apps/api/wrangler.production.toml` permanece ignorado (`.gitignore:21`).

### 16.2 Backup e deploy

- Backup remoto preventivo: `/tmp/opencode/personal-os-backup-predeploy-d10-20261121T172045Z`, 15 tabelas da
  allowlist, 14 linhas, 6 tabelas sensíveis excluídas, migrations `0000`–`0003` registradas. SHA-256 de `data.sql`
  `cc3619960953b81993f1171d1a160e6b086e2f6c9f140b5647555a1c66a6b768` conferido. Nenhum restore executado.
- Versão publicada antes: `62f512ad-8778-4622-a787-979b3d5499be`. Versão do deploy do hardening:
  `49b1c882-2672-472e-9128-e2f7037aecec`. A rotação de `SETUP_TOKEN` gerou a versão de secret
  `57e0298d-a370-49c0-8f82-8ff7c1ac2f93`, que é a versão ativa atual.
- Não houve criação de Worker ou D1, alteração de migrations, substituição de `CSRF_SECRET`/`IP_HASH_SALT`,
  contratação, cartão, cobrança ou push force.

### 16.3 Validação pós-deploy

- HSTS `max-age=15552000; includeSubDomains` presente em `/`, `/api/v1/health`, `/auth/me` (401), erro 403, erro
  404 e asset `/assets/*`; CSP e demais headers mantidos; `Cache-Control: no-store` na API inclusive em erros.
- `/estudos` e `/configuracoes` carregam via fallback SPA; `/sw.js`, manifesto e ícones respondem 200; o SW não
  guarda respostas de API (apenas precache do shell; `/api/` está no denylist).
- CSRF obrigatório: mutação sem token → 403. Origem hostil (`https://evil.example.com`) com token válido → 403.
- `health` reporta `db: ok`. D1 remoto: `No migrations to apply!`.
- `setup/options` sem token e com token inválido → 403; `login/options` com `rpId =
  personal-os.imathscc.workers.dev` e 0 credenciais; nenhum cookie `__Host-pos_session` emitido.
- Consultas somente leitura no D1 remoto confirmam **0 usuários e 0 passkeys**. Nenhum dado pessoal foi inserido.

### 16.4 Novo `SETUP_TOKEN`

Gerado com `openssl rand -hex 32` (256 bits) e enviado diretamente por stdin a
`wrangler secret put SETUP_TOKEN --name personal-os`. O valor não foi exibido, gravado em arquivo, passado como
argumento de processo nem registrado em log — o log de saída contém apenas a confirmação de upload. Os três secrets
presentes no Worker, conferidos **por nome**: `CSRF_SECRET`, `IP_HASH_SALT`, `SETUP_TOKEN`. O valor do novo token
deve ser lido pelo próprio usuário no Dashboard do Worker ou com `wrangler secret get` em terminal local seguro.

### 16.5 Estado do primeiro acesso

O ambiente está preparado, mas **o setup não foi concluído**: não há usuário, passkey, sessão pessoal nem dado
pessoal em produção. O primeiro registro de passkey exige autorização separada.

### 16.6 Limitações restantes

- A API de billing retorna `403 / erro 10000`; plano Free confirmado pelo usuário no Dashboard, mas método de
  pagamento/cobrança automática não é verificável por API.
- A desativação de Preview URLs foi confirmada por evidência de deploy (ausência do aviso) e config publicada; a conferência
  visual no Dashboard não foi feita nesta entrega.
- `/studies/*` ainda não tem rate limit de aplicação por usuário (documentado em [SECURITY.md](../SECURITY.md));
  não foi alterado nesta entrega.
- CPU p95 em ambiente publicado segue sem medição conclusiva; nenhuma otimização foi aplicada.

## Referências

- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) e
  [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) e
  [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Observability pricing](https://developers.cloudflare.com/observability/pricing/)
- [workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
- [Public Suffix List](https://publicsuffix.org/list/public_suffix_list.dat) (`workers.dev`)
- [ADR-0011 — Domínio e workers.dev](../decisions/0011-dominio-e-workers-dev.md)
- [Runbook de deploy](deploy.md), [backup/restauração](restore-drill.md) e
  [medições locais](local-measurements.md)
