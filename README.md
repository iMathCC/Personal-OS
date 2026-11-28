# Personal OS

Sistema pessoal de gestão e inteligência orientado por dados: objetivos, projetos, atividades, métricas, finanças, estudos, carreira, leituras, treino e bem-estar em um único lugar.

> **Status: Fase 1 — Tarefa 1.2.** Entregas 1 a 6 e 12 a 18 revisadas localmente; a Entrega 19 preparou a publicação integrada com runbook, migrations auditadas e drill de backup/restore. Versão publicada em produção corresponde à Entrega 10 (sem os recursos abaixo), com estado remoto não verificado nesta entrega. Há autenticação por passkey, App Shell, persistência D1 e vertical slices de **Estudos**, **Objetivos**, **Projetos/Tarefas**, **Inteligência/Revisão semanal**, **Estratégia/Planejamento**, **Dados pessoais/Integração** e **Inteligência/Decisão**. As mudanças das Entregas 12 a 18 estão **locais, sem commit, push ou deploy**. Não use com dados reais sem autorização explícita.

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
    src/features/   auth, dashboard, estudos, goals, planejamento, life, planned, settings
    src/components/ UI compartilhada (botão, ícones, estados)
    src/lib/        cliente API tipado e modelo de navegação
    test/           testes de navegação, estados, status e formatação
packages/
  db/         Schema Drizzle, cliente D1, helper UUIDv7, seeds e config do Drizzle Kit
  domain/     Regras puras de sessão, estudos, execução, inteligência, planejamento, life e segurança
  shared/     Contratos Zod compartilhados (health, auth, domínios e erros)
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
| `0003_core_studies.sql` | Modelo central, Estudos, relações tipadas e reserva/resultado idempotente (Entrega 5) |
| `0004_goals_milestones.sql` | Objetivos e marcos (Entrega 13) |
| `0005_execution_layer.sql` | Projetos, tarefas, dependências e marcos de projeto (Entrega 14) |
| `0006_weekly_reviews.sql` | Revisões semanais com snapshot congelado (Entrega 15) |
| `0007_strategic_planning.sql` | Nove tabelas aditivas de estratégia e planejamento (Entrega 16) |
| `0008_life_data.sql` | Doze tabelas aditivas de dados pessoais e importação (Entrega 17) |
| `0009_decision_alert_states.sql` | Estado de alertas de decisão: acknowledge/dismiss versionado (Entrega 18) |

```bash
cp apps/api/wrangler.local.example.toml apps/api/wrangler.local.toml  # uma vez, se ainda não existir
npm run db:migrate:local   # aplica 0000 → 0009 no binding DB
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

O CI em `.github/workflows/ci.yml` roda a sequência principal com Node 24 e `npm ci`, além de `npm audit --audit-level=high`. A suíte completa (`npm test`) inclui testes de integração de banco; `npm run test:integration` é o atalho para executá-los isoladamente. A validação da Entrega 18 cobre domínio (131), shared (27), web (84) e API (177) — **419 testes** —, incluindo **45/45** testes de integração de banco. Os testes de navegador usam Playwright local (Chromium + Firefox): `npm run test:e2e:env -- --reset`, iniciar o Worker em 8788 conforme instrução do script e `npm run test:e2e`. O fluxo de passkey real é automatizado no Chromium com autenticador virtual via CDP; no Firefox ele é explicitamente ignorado por limitação de automação. Detalhes em [ADR-0014](docs/decisions/0014-playwright-e2e.md).

### App Shell e dashboard (evoluído nas Entregas 12 a 18)

A navegação mantém três grupos (`Núcleo`, `Áreas da vida`, `Sistema`). Além de Visão geral e Configurações, estão disponíveis Estudos, Objetivos, Projetos, Tarefas, Execução, Inteligência, Revisão semanal, Estratégia, Planejamento, Ciclos, Capacidade, Cenários, Finanças, Saúde, Treinamento, Leitura (`/conhecimento` é alias), Tempo, Importações e Integração e, desde a Entrega 18, Vida, Alertas de decisão, Decisões e Revisões. Carreira segue em preparação, sem formulários ou indicadores simulados.

A camada de decisão reúne estratégia, execução, planejamento, dados pessoais, inteligência e revisão em `/inteligencia/vida`, `/inteligencia/alertas`, `/inteligencia/decisoes` e `/inteligencia/revisoes`. Alertas, recomendações e próximas ações são derivações determinísticas com fontes, cálculo, confiança, limitações e o que não se pode concluir; ausência de evidência aparece como `insufficient_data`, nunca como zero, e nenhuma relação entre domínios afirma causalidade. Somente reconhecer/dispensar alerta grava estado, com versão otimista e auditoria atômica ([ADR-0021](docs/decisions/0021-motor-de-decisao-e-painel-de-vida.md)).

O dashboard consome apenas dados reais da API:

- `GET /auth/me` — nome, fuso horário, preferências e contagens;
- `GET /health` — estado real da API/banco;
- `GET /studies/dashboard` e `GET /goals/dashboard` — sinais reais de Estudos e Objetivos, com fallback degradável;
- `GET /auth/sessions` — apenas na tela de Configurações.

Os módulos de dados pessoais têm páginas próprias e não injetam valores fictícios no dashboard. Cards de áreas, Objetivos, Atividade recente e Atenção mostram estados vazios explicativos quando não há fonte de dados. O roteador é `react-router` (já previsto no ADR-0001); o cliente de API continua único em `apps/web/src/lib/api.ts`.

### Medições locais

Medições locais (21/11/2026, Entrega 6): HTTP p50 39 ms / p95 113 ms, spans D1 p95 23 ms, no máximo 8 spans D1 por requisição. Na Entrega 18, o bundle inicial mede **715,49 kB bruto / 187,98 kB gzip** e o chunk lazy do ECharts 516,24 kB / 174,78 kB gzip; o Worker no dry-run ficou em 2624,64 KiB / 459,27 KiB gzip (ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)). CPU p95 em produção segue sem amostra suficiente. Método e limitações em [docs/operations/local-measurements.md](docs/operations/local-measurements.md).

Medição histórica da Tarefa 1.1 (20/11/2026): p50 11,4 ms, p95 15,7 ms, máximo 18,8 ms em 50 requisições ao health check, com 104,29 KB gzip de bundle. O tempo é latência de ponta a ponta no runtime local (inclui overhead do Miniflare), não CPU isolada. CPU p95 por rota só é observável no ambiente Cloudflare publicado e segue pendente.

A Entrega 1 da Tarefa 1.2 validou `@simplewebauthn/server@14.1.0` no Workers com 15 testes de spike (relatório em `docs/spikes/001-webauthn-workers.md`).

## Deploy (ainda não executado)

`apps/api/wrangler.toml` é um modelo com placeholders; a config efetiva é gerada por `npm run deploy:prepare` e validada por `npm run deploy:check`. Antes de publicar é preciso autorização humana para: criar o banco D1 remoto, definir `RP_ID`/`ORIGIN`, definir os segredos no Worker, aplicar migrações em workflow aprovado e executar `npm run deploy`.

Runbook completo em [docs/operations/deploy.md](docs/operations/deploy.md). A publicação gratuita em `workers.dev` (R$ 0, sem domínio plano pago) está detalhada em [docs/operations/free-deployment.md](docs/operations/free-deployment.md), incluindo a regra de RP ID para o hostname completo. `wrangler deploy --dry-run` e `deploy:check` já passaram com valores sintéticos de `workers.dev`; nenhum recurso remoto foi criado.

## Limitações conhecidas desta etapa

- Passkey real foi validada no Chromium com autenticador virtual; Safari/iOS, Firefox com autenticador de plataforma e dispositivos físicos seguem pendentes de validação humana.
- `pos_vid` é usado como parte do subject CSRF anônimo e é inicializado no contexto comum da API; continua sendo dado complementar, sem IP puro ([ADR-0012](docs/decisions/0012-invariantes-operacionais-de-auth.md)).
- Runbooks operacionais em `docs/operations/`, mas sem endpoints administrativos auditados.
- Backup/restauração lógicos funcionam e foram testados em banco isolado; não há backup automático em R2 nem monitoramento de cotas remotas.
- Fora das vertical slices: finanças, saúde, treino, leitura, bem-estar e demais módulos. Há registro real de Estudos, Objetivos, Projetos/Tarefas, revisões semanais e planejamento estratégico; gráficos ECharts são carregados sob demanda. Não há recomendações executadas, tempo de tarefa observado ou IA externa habilitada.
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
