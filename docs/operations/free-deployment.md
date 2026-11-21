# Publicação gratuita no `workers.dev` (R$ 0)

Este runbook cobre a publicação do Personal OS **somente com recursos gratuitos da Cloudflare**, no endereço
`https://<worker-name>.<account-subdomain>.workers.dev`. A decisão de custo recorrente R$ 0 é permanente: se um
recurso necessário deixar de caber no plano gratuito, **pare e peça autorização** — nunca faça fallback automático
para um plano pago.

Estado desta preparação: conta Cloudflare **não autenticada** neste ambiente (`npx wrangler whoami --json` retornou
`{"loggedIn": false}`; `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` ausentes). Nenhum Worker, banco, secreto,
domínio, DNS, migration remota ou deploy foi criado. A configuração efetiva em
`apps/api/wrangler.production.toml` contém **valores sintéticos** e não deve receber credenciais reais.

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
