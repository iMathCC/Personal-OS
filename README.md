# Personal OS

Sistema pessoal de gestão e inteligência orientado por dados: objetivos, projetos, atividades, métricas, finanças, estudos, carreira, leituras, treino e bem-estar em um único lugar.

> **Status: Fase 1 — Tarefa 1.2.** Entregas 1 a 3 publicadas e em revisão; **Entrega 4 (App Shell e dashboard) implementada localmente, sem push**. Spike WebAuthn aprovado, persistência D1 com migrações e seeds, autenticação por passkey com sessões e, agora, App Shell com dashboard inicial. **Ainda não há módulos de negócio**: áreas sem implementação aparecem como planejadas, e o dashboard só usa dados reais de `/auth/me`, `/auth/sessions` e `/health`. Não use com dados reais.

## Requisitos

- **Node.js 24 LTS** (`>=24 <25`) — versão fixada em `.nvmrc`.
- **npm 11** (`>=11`), incluído no Node 24.

```bash
nvm use            # lê .nvmrc (24)
node -v            # v24.x
npm -v             # 11.x
npm ci
```

## Documentação

| Documento | Conteúdo |
| --- | --- |
| [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) | Escopo, requisitos, ambiguidades e critérios de aceitação |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitetura lógica, topologia, monorepo, limites e riscos |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Entidades, relacionamentos, índices, auditoria e retenção |
| [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md) | Contratos REST, autenticação, erros e versionamento |
| [docs/SECURITY.md](docs/SECURITY.md) | Modelo de ameaças, autenticação, proteção de dados e checklist |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Fases, entregas verificáveis e próxima tarefa |
| [docs/decisions/](docs/decisions/) | Registros de decisão de arquitetura (ADRs) |
| [docs/spikes/001-webauthn-workers.md](docs/spikes/001-webauthn-workers.md) | Spike WebAuthn no Workers (Entrega 1, aprovado) |
| [AGENTS.md](AGENTS.md) | Regras permanentes para agentes e desenvolvedores |

## Estrutura do monorepo

```text
apps/
  api/        Worker Hono + D1 binding + testes Vitest
  web/        SPA React + Vite + Tailwind v4 + shadcn/ui + PWA
    src/app/        App, AuthScreen, AppShell e rotas
    src/features/   auth, dashboard, planned, settings
    src/components/ UI compartilhada (botão, ícones, estados)
    src/lib/        cliente API tipado e modelo de navegação
    test/           testes de navegação, estados, status e formatação
packages/
  db/         Schema Drizzle, cliente D1, helper UUIDv7, seeds e config do Drizzle Kit
  domain/     Regras puras de sessão, contadores, rate limit e segurança
  shared/     Contratos Zod compartilhados (health, auth, erros)
docs/         Especificação, arquitetura, roadmap, ADRs, spike e operações
```

As migrações ficam em `apps/api/migrations` (o Wrangler as aplica pelo binding `DB`). A SPA consome apenas a API; o frontend não acessa D1 nem repositórios.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Sobe API (`:8787`) e web (`:5173`) juntos |
| `npm run dev:api` | Sobe apenas o Worker com `wrangler dev` e D1 local |
| `npm run dev:web` | Sobe apenas o Vite; `/api` é proxiado para `127.0.0.1:8787` |
| `npm run build` | Typecheck + build de produção da SPA |
| `npm run preview:web` | Serve o build localmente |
| `npm run lint` | ESLint em todo o repositório |
| `npm run format` / `format:check` | Prettier (escrita / verificação) |
| `npm run typecheck` | TypeScript estrito em todos os workspaces |
| `npm test` | Testes de domínio, frontend (navegação/estados) e API no runtime do Workers (Miniflare), incluindo integração de DB |
| `npm run test:integration` | Somente os testes de migração/integridade do banco (`apps/api/test/db`) |
| `npm run db:generate` | Gera uma nova migração SQL a partir do schema Drizzle |
| `npm run db:migrate:local` | Aplica migrações pendentes no D1 local (`DB`) |
| `npm run db:seed:local` | Aplica os seeds idempotentes no D1 local (`DB`) |
| `npm run check` | Formatação + lint + typecheck + testes + build |
| `npm run deploy:prepare` | Gera `apps/api/wrangler.production.toml` a partir de `RP_ID`, `ORIGIN` e `D1_DATABASE_ID` (gitignored) |
| `npm run deploy:check` | Valida config gerada, assets e bindings antes do deploy |
| `npm run deploy` | `deploy:check` + build + `wrangler deploy` (bloqueado até autorização) |
| `npm run backup:d1` | Export lógico com allowlist, schema e manifest checksum |
| `npm run restore:d1` | Restauração validada, somente em banco vazio |
| `npm run backup:drill` | Drill completo em banco isolado (migrations, export, restore, verificação) |
| `npm run test:e2e:env -- --reset` | Recria ambiente isolado HTTPS para navegador |
| `npm run test:e2e` | Playwright em Chromium e Firefox contra o Worker isolado |

## Rodando localmente

```bash
npm ci
npm run dev
```

- Web: <http://localhost:5173>
- API: <http://127.0.0.1:8787/api/v1/health>

O D1 é local (Miniflare): o `database_id` em `apps/api/wrangler.local.toml` é fictício e nenhum banco remoto é tocado. O health check executa `SELECT 1` para provar que o binding está acessível.

```bash
curl -s http://127.0.0.1:8787/api/v1/health
# {"status":"ok","db":"ok","version":"0.1.0","time":"..."}
```

Respostas de erro seguem o envelope `{ error: { code, message, requestId } }`; toda resposta recebe `X-Request-Id` e headers de segurança.

## Banco de dados local (Tarefa 1.2)

O schema Drizzle vive em `packages/db/src/schema` e é a fonte de verdade para `npm run db:generate`. As migrações geradas/revisadas são:

| Migração | Conteúdo |
| --- | --- |
| `0000_init.sql` | 12 tabelas (`app_settings`, `users`, `sources`, `areas`, `passkeys`, `sessions`, `recovery_codes`, `recovery_tokens`, `auth_challenges`, `rate_limits`, `idempotency_keys`, `audit_log`), FKs, índices e checks |
| `0001_audit_append_only.sql` | Triggers de auditoria append-only e limite de 10 sessões ativas |
| `0002_audit_no_replace.sql` | Bloqueio de `INSERT OR REPLACE` em `audit_log` (o D1 não dispara o trigger de DELETE nesse caso) |

```bash
cp apps/api/wrangler.local.example.toml apps/api/wrangler.local.toml  # uma vez, se ainda não existir
npm run db:migrate:local   # aplica 0000 → 0001 → 0002 no binding DB
npm run db:seed:local      # 4 fontes de sistema + 8 áreas; idempotente
npm run db:seed:local      # repetir não duplica nada
```

`apps/api/wrangler.local.toml` contém apenas valores dummy e **não é versionado**. Os testes usam esse arquivo quando existe e, em clone limpo, caem para `wrangler.local.example.toml`.

Os seeds usam IDs fixos apenas para as quatro fontes de sistema (exceção documentada em `docs/DATA_MODEL.md`); as áreas usam UUIDv7. Nenhum dado financeiro, de saúde ou fictício é semeado.

Os testes de integração usam o binding descartável `DB_TEST`, declarado somente na configuração local (ou no exemplo, em clone limpo). Ele não tem `migrations_dir`: os testes aplicam o SQL das migrações manualmente e recriam o banco a cada caso. Nenhum código de aplicação consome `DB_TEST`. O banco `DB` já migrado não é apagado pelos testes.

## Testes e verificação

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
npm audit --audit-level=high
```

O CI em `.github/workflows/ci.yml` roda a sequência principal com Node 24 e `npm ci`, além de `npm audit --audit-level=high`. A suíte completa da API (`npm test`) inclui testes de integração de banco; `npm run test:integration` é o atalho para executá-los isoladamente. Os testes unitários cobrem domínio (34), frontend (32) e API (81). Os testes de navegador usam Playwright local (Chromium + Firefox): `npm run test:e2e:env -- --reset`, iniciar o Worker em 8788 conforme instrução do script e `npm run test:e2e`. O fluxo de passkey real é automatizado no Chromium com autenticador virtual via CDP; no Firefox ele é explicitamente ignorado por limitação de automação. Detalhes em [ADR-0014](docs/decisions/0014-playwright-e2e.md).

### App Shell e dashboard (Entrega 4)

A navegação tem dez áreas em três grupos (`Núcleo`, `Áreas da vida`, `Sistema`). Somente **Visão geral** e **Configurações** estão disponíveis; as demais rotas renderizam páginas que explicam o estado "Em preparação" ou "Não configurada", sem formulários ou indicadores simulados.

O dashboard usa apenas dados já existentes na API:

- `GET /auth/me` — nome, fuso horário, preferências e contagens;
- `GET /health` — estado real da API/banco, exibido em "Atenção e prioridades";
- `GET /auth/sessions` — apenas na tela de Configurações.

Cards de áreas, Objetivos, Atividade recente e Atenção mostram estados vazios explicativos quando não há fonte de dados. Nenhum endpoint novo, schema, migration ou dado fictício foi introduzido. O roteador é `react-router` (já previsto no ADR-0001); o cliente de API continua único em `apps/web/src/lib/api.ts`.

### Medições locais

Medições mais recentes (21/11/2026, Entrega 6): HTTP p50 39 ms / p95 113 ms, spans D1 p95 23 ms, no máximo 8 spans D1 por requisição e bundle inicial de **129,86 kB gzip**. Método, limitações e resultados completos em [docs/operations/local-measurements.md](docs/operations/local-measurements.md).

Medição histórica da Tarefa 1.1 (20/11/2026): p50 11,4 ms, p95 15,7 ms, máximo 18,8 ms em 50 requisições ao health check, com 104,29 KB gzip de bundle. O tempo é latência de ponta a ponta no runtime local (inclui overhead do Miniflare), não CPU isolada. CPU p95 por rota só é observável no ambiente Cloudflare publicado e segue pendente.

A Entrega 1 da Tarefa 1.2 validou `@simplewebauthn/server@14.1.0` no Workers com 15 testes de spike (relatório em `docs/spikes/001-webauthn-workers.md`).

## Deploy (ainda não executado)

`apps/api/wrangler.toml` é um modelo com placeholders; a config efetiva é gerada por `npm run deploy:prepare` e validada por `npm run deploy:check`. Antes de publicar é preciso autorização humana para: criar o banco D1 remoto, definir `RP_ID`/`ORIGIN`, definir os segredos no Worker, aplicar migrações em workflow aprovado e executar `npm run deploy`.

Runbook completo em [docs/operations/deploy.md](docs/operations/deploy.md). A publicação gratuita em `workers.dev` (R$ 0, sem domínio plano pago) está detalhada em [docs/operations/free-deployment.md](docs/operations/free-deployment.md), incluindo a regra de RP ID para o hostname completo. `wrangler deploy --dry-run` e `deploy:check` já passaram com valores sintéticos de `workers.dev`; nenhum recurso remoto foi criado.

## Limitações conhecidas desta etapa

- Passkey real foi validada no Chromium com autenticador virtual; Safari/iOS, Firefox com autenticador de plataforma e dispositivos físicos seguem pendentes de validação humana.
- `pos_vid` ainda não é usado; quando existir será dado complementar, com IP confiável e hashes com salt ([ADR-0012](docs/decisions/0012-invariantes-operacionais-de-auth.md)).
- Runbooks operacionais em `docs/operations/`, mas sem endpoints administrativos auditados.
- Backup/restauração lógicos funcionam e foram testados em banco isolado; não há backup automático em R2 nem monitoramento de cotas remotas.
- Fora da vertical slice: CRUD de objetivos/projetos/tarefas, finanças, saúde e demais módulos. Estudos já tem registro real de cursos/sessões; gráficos e recomendações não existem.
- Testes de navegador cobrem deep links, headers, PWA/offline, responsividade de 360–1920 px e foco/teclado, mas não substituem conferência visual humana antes da aprovação final.
- PWA instalável com precache somente do shell; nenhuma resposta de API é cacheada e não há escrita offline.
- `npm run deploy` está preparado e passou em `--dry-run`, mas não foi validado contra a Cloudflare remota.
- `npm audit` não tem high/critical, mas reporta vulnerabilidades `moderate` em dependências de desenvolvimento (glob/minimatch via `vite-plugin-pwa`).

## Restrições centrais

- Custo operacional de **R$ 0** (nenhum plano pago, domínio opcional).
- Desktop e celular via **PWA**.
- Dados sob controle do usuário, com **exportação e restauração** nas fases seguintes.
- Aplicação **funcional sem IA externa**.
- Monólito modular, API como única porta de acesso aos dados.
