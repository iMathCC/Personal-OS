# Arquitetura — Personal OS

- **Versão:** 1.0 (Fase 0)
- **Data:** 2026-11-20
- **Status:** Proposta para aprovação

## 1. Resumo executivo

O Personal OS será um **monólito modular** implantado como **um único Cloudflare Worker**, que serve a SPA React e a API Hono no mesmo domínio. A persistência é um banco **Cloudflare D1** (SQLite) acessado exclusivamente pela API via **Drizzle ORM**. Regras de negócio puras ficam em um pacote de domínio sem dependências de Cloudflare, o que preserva testabilidade e portabilidade.

```text
Navegador (React PWA)
        │  HTTPS, same-origin, cookie de sessão
        ▼
Cloudflare Worker ──────────────────────────────┐
  ├─ /api/v1/*  → Hono → serviços → repositórios → D1
  └─ /*         → Static Assets (SPA)            │
                                                 │
  Cron Triggers → agregações, backups, lembretes ┘
        │
        ├─ Cloudflare R2 (opcional, backups/arquivos)
        └─ Provedor de IA externo (opcional, BYOK, consentimento)
```

**Por que não separar frontend e backend em dois Workers agora?** A separação lógica é obrigatória e será mantida (contratos, camadas, pacotes). A separação física em dois deployments adicionaria CORS, cookies cross-site, CSRF mais complexo, dois pipelines e nenhum benefício nesta escala. O ADR-0002 registra a decisão e o caminho de migração.

## 2. Restrições que moldam a arquitetura

| Restrição | Consequência arquitetural |
| --- | --- |
| R$ 0 de custo operacional | Plano gratuito do Workers/D1; sem domínio pago por padrão; sem serviços gerenciados pagos |
| 10 ms de CPU por requisição (Workers Free) | Handlers enxutos, sem KDF caro, sem processamento pesado por request, agregações pré-calculadas |
| D1 Free: 5 GB, 500 MB/DB, 100 mil escritas/dia | Schema enxuto, índices seletivos, agregações materializadas, importações em lote |
| 100 mil requisições/dia (Free) | Assets estáticos são gratuitos/ilimitados; API precisa ser eficiente e cacheável |
| D1 é single-threaded por banco | Consultas curtas, `batch()` para múltiplas escritas, sem transações interativas longas |
| Dados sob controle do usuário | Exportação/restauração de primeira classe; SQL padrão; nenhum dado em serviço opaco |
| IA opcional | Núcleo determinístico; IA atrás de interface, com consentimento e proveniência |
| Acesso desktop + celular | PWA responsiva; leitura offline; formulários móveis de baixa fricção |
| Migração futura | Domínio puro, repositórios, contratos Zod, Drizzle e SQL portável |

## 3. Visão lógica

### 3.1 Camadas

```text
┌─────────────────────────────────────────────────────────────┐
│ Interface (apps/web)                                        │
│ React + Vite + TS · Tailwind + shadcn/ui · ECharts · PWA     │
│ - não acessa banco nem serviços externos diretamente         │
│ - consome exclusivamente /api/v1 via cliente tipado          │
└───────────────────────────┬─────────────────────────────────┘
                            │ contratos (packages/shared)
┌───────────────────────────▼─────────────────────────────────┐
│ API (apps/api)                                              │
│ Hono · middleware (auth, CSRF, request-id, erros, rate limit)│
│ Rotas → Serviços de aplicação → Repositórios                 │
│ - validação Zod na borda                                    │
│ - autorização e auditoria em um único ponto                  │
└───────────────┬───────────────────────────┬─────────────────┘
                │                           │
┌───────────────▼──────────────┐  ┌─────────▼─────────────────┐
│ Domínio (packages/domain)    │  │ Persistência (packages/db) │
│ Funções puras, sem I/O       │  │ Drizzle schema + migrations│
│ finanças, métricas, projeções│  │ repositórios específicos   │
│ estatística, regras          │  │ D1 (SQLite)                │
└──────────────────────────────┘  └───────────────────────────┘
```

**Regra de dependência:** `web → shared`; `api → shared, domain, db`; `db → shared`; `domain → shared` (apenas tipos/utilitários puros). `domain` **não** importa Drizzle, Hono, Cloudflare ou React. `shared` não importa nada de runtime de framework.

### 3.2 Módulos da API

Cada módulo é uma pasta com `routes.ts`, `service.ts`, `repository.ts` e `schemas.ts` (quando aplicável). Módulos não importam repositórios uns dos outros; comunicação ocorre por serviços ou pelo domínio.

```text
apps/api/src/
  index.ts                 # entrypoint do Worker (fetch + scheduled)
  app.ts                   # composição do Hono
  middleware/              # auth, csrf, request-id, error, rate-limit
  modules/
    auth/                  # passkeys, sessões, recuperação
    areas/
    goals/
    projects/
    tasks/
    events/
    checkins/
    metrics/
    dashboard/             # composição de leitura, sem escrita
    finance/
    studies/
    career/
    reading/
    training/
    wellbeing/
    habits/
    intelligence/          # projeções + recomendações (regras)
    export/                # exportação/importação
    audit/                 # consulta de histórico
  jobs/                    # handlers de cron
  lib/                     # helpers de infraestrutura (crypto, datas)
```

Módulos só são criados quando entram na fase correspondente. A Fase 1 contém `auth`, `areas`, `audit`, `export` e `health`. O módulo `auth` está implementado na Entrega 3 (domínio, contratos compartilhados, rotas, middlewares e UI mínima); os demais módulos de negócio entram nas entregas seguintes.

## 4. Topologia de deploy

```text
GitHub (privado)
  │ push em main
  ▼
GitHub Actions (lint, typecheck, testes, build)
  │ wrangler deploy (token com escopo mínimo)
  ▼
Cloudflare Worker "personal-os"
  ├─ assets: apps/web/dist  (SPA, cache imutável por hash)
  ├─ /api/*  (Hono)
  ├─ D1 binding: DB
  ├─ R2 binding: BACKUPS (opcional)
  └─ Cron: 0 3 * * * (agregações/backup)
```

- **Um ambiente de produção** + ambiente local. Staging dedicado fica para quando houver necessidade; o plano free permite 10 bancos, mas duplicar dados pessoais sem motivo aumenta risco.
- **Same-origin** elimina CORS e simplifica cookies `__Host-`.
- **Assets** são servidos pelo Cloudflare sem invocar o Worker e sem consumir cota de requisições.
- **Migrations** rodam antes do deploy, de forma explícita (não automática em cada request). Em CI, exigem aprovação manual (`workflow_dispatch` ou environment protection).

## 5. Estrutura do monorepo

```text
personal-os/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── app.ts
│   │   │   ├── middleware/
│   │   │   ├── modules/
│   │   │   ├── jobs/
│   │   │   └── lib/
│   │   ├── test/
│   │   ├── wrangler.toml
│   │   ├── vitest.config.ts
│   │   └── package.json
│   └── web/
│       ├── src/
│       │   ├── main.tsx
│       │   ├── app/            # rotas, providers, layouts
│       │   ├── components/     # UI compartilhada (shadcn em ui/)
│       │   ├── features/       # uma pasta por domínio
│       │   ├── lib/            # api client, formatadores, hooks
│       │   └── styles/
│       ├── public/
│       ├── vite.config.ts
│       ├── index.html
│       └── package.json
├── packages/
│   ├── shared/                 # contratos Zod, DTOs, erros, constantes
│   ├── domain/                 # regras puras + testes
│   └── db/                     # schema Drizzle, migrations, seeds
├── docs/
│   ├── decisions/
│   └── ...
├── .github/workflows/
├── AGENTS.md
├── package.json                # npm workspaces
├── tsconfig.base.json
├── .nvmrc                      # Node 24
└── README.md
```

**Gerenciador:** npm workspaces. Justificativa: já disponível no ambiente, sem dependência adicional; suficiente para 5 pacotes. pnpm seria mais eficiente, mas adiciona ferramenta e não resolve problema atual ([ADR-0001](decisions/0001-stack-e-monorepo.md)).

## 6. Fluxo de uma requisição

Contratos detalhados: [API_CONTRACTS.md](API_CONTRACTS.md).

Exemplo: `POST /api/v1/tasks`.

1. Cloudflare roteia `/api/*` para o Worker (assets não são consultados).
2. Middlewares: `requestId` → `secureHeaders` → `apiContext` (cookie → hash → sessão validada no D1, IP/UA em hash, `pos_vid`) → `bodyLimit` (16 KB em auth) → `originAndCsrf` (allowlist, JSON, token) → `rateLimit` por rota. `authRequired` é aplicado nas rotas protegidas.
3. Rota valida corpo/params com Zod (`packages/shared`).
4. Serviço carrega entidades via repositório, aplica regras, verifica `version` (concorrência otimista).
5. `db.batch([insert/update, auditLog])` grava mutação + auditoria atomicamente.
6. Resposta `201` com `data`, `ETag`, `Location` e `X-Request-Id`.
7. Erros são convertidos em envelope estável; detalhes internos nunca vazam.

**Orçamento de CPU por requisição (meta):** roteamento/middleware ≤ 1,5 ms; validação ≤ 0,5 ms; acesso a dados/mapeamento ≤ 1,5 ms; serialização ≤ 1 ms; margem ≥ 5 ms. Medir com `wrangler dev --local` e CPU profiling; qualquer handler acima de 5 ms médios é investigado.

**Orçamento de queries:** ≤ 8 statements por requisição (limite free: 50 subrequests). Dashboards usam tabelas agregadas, não varreduras.

## 7. Persistência e dados derivados

### 7.1 D1 + Drizzle

- Driver `drizzle-orm/d1`; migrações SQL geradas por `drizzle-kit` em `apps/api/migrations` e aplicadas por `wrangler d1 migrations apply`. Triggers que o Kit não gera vivem em migrações manuais numeradas (`0001`, `0002`) e são imutáveis após aplicação.
- D1 não oferece transações interativas: usar `db.batch()` para atomicidade. Serviços não mantêm transação aberta entre awaits. O batch não para ao encontrar uma escrita condicional com zero linhas; proteger a auditoria com `WHERE changes()=1`.
- `batchSql()` (`packages/db/src/client.ts`) envia templates `sql` puros pelo `$client.batch()` do D1 via `SQLiteAsyncDialect.sqlToQuery()`: o `db.batch()` do Drizzle aceita apenas queries preparadas e falha com SQL puro. O serviço de auth usa `atomicBatch()`, que converte violação de `UNIQUE` dos guards em `409 CONFLICT`.
- `PRAGMA foreign_keys = ON` (D1 aplica FKs); toda FK tem índice explícito.
- IDs UUIDv7 (ordenáveis por tempo), `TEXT`; exceção documentada: quatro IDs fixos de fontes de sistema.
- A configuração local do Worker (modelo em `apps/api/wrangler.local.example.toml`, não versionada) expõe `DB_TEST`, binding descartável usado somente por testes de migração/destrutivos. Nenhum código de aplicação o consome.
- Datas em UTC ISO-8601 com milissegundos + `local_date` para agrupamento.
- Dinheiro em centavos (`INTEGER`).

### 7.2 Agregações materializadas

O plano free permite 5 milhões de leituras/dia, mas cada leitura de linha conta, e dashboards com varreduras completas degradam CPU e cota. Estratégia:

1. Observações brutas são a fonte da verdade (`metric_observations`, `transactions`, `study_sessions` etc.).
2. `metric_daily` guarda agregados por métrica/dia com `algorithm_version`.
3. Escritas relevantes marcam o dia como “sujo” em uma tabela `aggregation_queue` (ou recalculam o dia no mesmo batch, se barato).
4. Cron noturno recalcula dias sujos e os últimos 7 dias (janela móvel).
5. Recalculo completo sob demanda (`/api/v1/admin/recompute`) para backfill.
6. Dashboards leem `metric_daily` e tabelas de resumo, nunca varrem anos de observações.

**Reprodutibilidade:** agregados são derivados; apagar e recalcular deve produzir o mesmo resultado. Guardar `algorithm_version` e `computed_at`.

### 7.3 Histórico e auditoria

- `events` é o registro de acontecimentos do usuário (domínio).
- `audit_log` é o log técnico append-only de mutações (quem, quando, antes/depois, request ID). Triggers no banco bloqueiam `UPDATE`, `DELETE` e `INSERT OR REPLACE`, mas não substituem o serviço: ator, `request_id` e payload sensível continuaram sendo responsabilidade da camada de aplicação.
- Limite de 10 sessões ativas é conferido também por trigger; a revogação LRU é feita pelo serviço com auditoria no mesmo batch ([ADR-0012](decisions/0012-invariantes-operacionais-de-auth.md)).
- Não haverá event sourcing completo. Justificativa: complexidade de reconstrução, versionamento de eventos e projeções não se paga para um sistema pessoal; auditoria + soft delete atendem ao requisito ([ADR-0007](decisions/0007-auditoria-e-historico.md)).

## 8. Frontend e PWA

- **React 19 + Vite + TypeScript estrito**; roteamento por `react-router` (**adotado na Entrega 4**, modo biblioteca, justificativa em [ADR-0001](decisions/0001-stack-e-monorepo.md)). Estado de servidor por `@tanstack/react-query` e formulários com `react-hook-form` + `zod` continuam **propostos** (D-14), não adotados.
- **Tailwind CSS v4** + **shadcn/ui** (componentes copiados para o repo, sem dependência de runtime do shadcn). Tokens escuros em `src/index.css` são a fonte do tema desde a Entrega 4.
- **ECharts** via `echarts/core` com imports seletivos; wrapper próprio (`<Chart>`) com `ResizeObserver`; carregamento lazy por rota. Não usar `echarts-for-react` (dependência desnecessária).
- **PWA** com `vite-plugin-pwa` (Workbox):
  - `registerType: 'prompt'` para evitar atualização silenciosa no meio de um formulário.
  - Precache do shell e assets com hash; `NetworkFirst` para GETs de API com cache curto (5 min) e `stale-while-revalidate` para dados de referência.
  - Nunca cachear mutações; requisições não-GET falham claramente offline.
  - Fallback offline com dados da última sessão.
- **Acessibilidade:** componentes Radix (base do shadcn), foco visível, navegação por teclado, contraste AA.
- **Orçamento de bundle:** inicial ≤ 250 KB gzip; chunk de gráficos ≤ 300 KB gzip; medir no CI com `vite build` + relatório de tamanho.

### 8.0 Estrutura da SPA (Entrega 4)

- `src/app/`: `App` decide entre boot, erro de inicialização, autenticação e shell; `AuthScreen` contém apenas setup/login/recuperação; `AppShell` é o layout autenticado; `routes.tsx` mapeia as rotas.
- `src/features/`: `auth` (bootstrap de sessão e sessões ativas), `dashboard`, `planned` (módulos sem implementação) e `settings`. Regras de negócio continuam em `packages/domain`; a UI apenas consome DTOs e deriva estados de apresentação.
- `src/lib/api.ts` continua sendo o único cliente HTTP. O dashboard lê somente `GET /auth/me` e `GET /health`; `GET /auth/sessions` alimenta Configurações. Não existe endpoint de áreas/objetivos/atividades/alertas, então a UI exibe estados vazios e status honestos em vez de dados simulados.
- `src/components/` concentra botão shadcn, ícones SVG próprios e componentes de `loading`/`erro`/`vazio`; `src/lib/navigation.ts` é a fonte única do mapa de dez áreas e de sua disponibilidade.
- Testes de UI usam Vitest com ambiente Node e `react-dom/server` (sem `jsdom`/testing-library); funções puras cobrem disponibilidade de módulos, status das áreas, formatação no fuso do usuário e estados de interface.

### 8.1 Estratégia offline (v1)

Leitura offline + escrita online. Não haverá fila de mutações offline na Fase 1: sincronização de conflitos exige versionamento e resolução que não se justifica antes de validar uso. A UI mostra estado offline e bloqueia ações de escrita com mensagem clara. Reavaliar na Fase 6.

## 9. Inteligência artificial desacoplada

```ts
// packages/domain ou api/modules/intelligence
interface RecommendationProvider {
  id: string;
  generate(input: RecommendationInput): Promise<RecommendationDraft[]>;
}
```

- **Padrão:** `RulesRecommendationProvider`, determinístico, sem rede.
- **Opcional:** `LlmRecommendationProvider`, habilitado explicitamente, com chave fornecida pelo usuário (BYOK), timeout, limite de tokens e redaction.
- A IA recebe apenas o recorte necessário (não o banco inteiro), nunca segredos, e a chamada é registrada com provedor/modelo/versão de prompt.
- Números exibidos como oficiais vêm do motor determinístico; o LLM pode explicar, priorizar ou redigir, mas não calcular indicadores financeiros/estatísticos.
- Sem IA, o produto funciona integralmente (requisito confirmado).
- Recomendações são registros persistidos com evidências e estado; não são geradas a cada carregamento (custo e reprodutibilidade).

## 10. Automação e jobs

Cloudflare Cron Triggers (limite free: 5 por conta). Planejados:

| Job | Frequência | Responsabilidade |
| --- | --- | --- |
| `aggregate` | diário 03:00 UTC | recalcular dias sujos + janela de 7 dias |
| `backup` | semanal, domingo 04:00 UTC | export JSON → R2 (se habilitado) + retenção |
| `reminders` | diário 10:00 UTC | gerar lembretes in-app (sem e-mail) |
| `maintenance` | mensal | limpar sessões expiradas, idempotency keys, desafios WebAuthn |

Jobs devem ser idempotentes, registrar execução em `job_runs` e nunca exceder 10 s de CPU (free). Trabalho pesado é dividido em lotes por dia, não em uma única execução.

## 11. Observabilidade

Sem depender de produtos pagos:

- `X-Request-Id` em toda resposta; logs estruturados em JSON (console) com request ID, rota, status, duração e `rows_read/rows_written` do D1.
- Workers Logs free: 200 mil eventos/dia, retenção de 3 dias (verificar mudança de preço em dez/2026).
- `wrangler tail` para depuração ao vivo.
- Tabela `job_runs` para auditoria de crons.
- Health check `GET /api/v1/health` (sem autenticação, sem dados sensíveis) para monitoramento externo gratuito opcional (ex.: UptimeRobot free) — decisão futura.
- Nunca logar tokens, cookies, valores financeiros detalhados ou conteúdo de notas.

## 12. Ambientes, configuração e CI/CD

| Ambiente | Banco | Uso |
| --- | --- | --- |
| Local | D1 local (Miniflare/Wrangler) | desenvolvimento e testes |
| Produção | D1 remoto | uso real |

- Configuração por `wrangler.toml` + variáveis; segredos via `wrangler secret put` e GitHub Actions Secrets. `.dev.vars` é gitignored.
- **CI (GitHub Actions free):** instalar com `npm ci`, lint, typecheck, testes unitários, testes de integração com D1 local, build, verificação de bundle. Alvo < 5 min.
- **CD:** `wrangler deploy` somente em `main` após CI verde; migrations em workflow separado com aprovação.
- **Versionamento:** Conventional Commits; releases por tag; changelog manual no início.
- **Node 24 LTS** obrigatório (Vite 8 exige Node ≥ 20.19/22.12; o requisito foi fixado em 24 por decisão D-15). Fixar em `.nvmrc` e `engines`.

## 13. Compatibilidade da stack (verificada em 2026-11-20)

| Tecnologia | Papel | Compatível? | Observações / riscos |
| --- | --- | --- | --- |
| React + Vite + TS | SPA | Sim | Assets estáticos do Workers; Vite 7 exige Node ≥ 20.19/22.12 |
| Tailwind CSS v4 | Estilo | Sim | Plugin Vite oficial; shadcn/ui suporta Tailwind v4 |
| shadcn/ui | Componentes | Sim | Código copiado (Radix + CVA); não é dependência de runtime |
| Apache ECharts | Gráficos | Sim | Client-side; usar imports seletivos e lazy load; bundle grande se importado inteiro |
| Hono | API | Sim | Primeira classe em Workers; middlewares leves |
| Cloudflare Workers | Runtime | Sim | Free: 100 mil req/dia, **10 ms CPU**, 50 subrequests, 128 MB |
| Cloudflare D1 | Banco | Sim | Free: 5 GB total, 500 MB/DB, 5 mi leituras/dia, 100 mil escritas/dia, 7 dias de Time Travel |
| Drizzle ORM + Kit | ORM/migrações | Sim | Driver `d1`; sem transações interativas; usar `batch()`; SQLite |
| Zod | Validação | Sim | **Usar ≥ 4.5.0** (versões antigas consomem muita memória no Workers, conforme docs) |
| vite-plugin-pwa | PWA | Sim | Workbox; cuidado com precache e atualização |
| GitHub privado | Código/CI | Sim | Free: 2.000 min/mês de Actions (Linux), 500 MB Packages; confirmar limites da conta |
| Cloudflare R2 (opcional) | Backups | Sim, com ressalva | Free: 10 GB-mês, 1 mi Class A, 10 mi Class B; **pode exigir perfil de faturamento** |
| Cloudflare Access (alternativa de auth) | Zero Trust | Sim, com ressalva | Free até 50 usuários, mas exige domínio em zona Cloudflare (não funciona em `workers.dev`) |

**Incompatibilidades/limitações conhecidas:**

- `bcrypt`/`argon2`/PBKDF2 com muitas iterações podem estourar 10 ms de CPU → não usar senha tradicional no free tier; usar passkeys.
- Processamento de imagem/PDF, geração de relatórios pesados e ML no Worker não cabem no orçamento de CPU → fazer no cliente ou fora de escopo.
- D1 não suporta transações interativas nem `BEGIN` persistente entre requisições → batch.
- Service worker não pode cachear respostas autenticadas de forma indiscriminada → estratégia explícita e expurgo no logout.
- `workers.dev` não é compatível com Cloudflare Access e não permite RP ID estável se um domínio próprio for adotado depois.

## 14. Dependências adicionais propostas

Além da stack aprovada, estas dependências são necessárias ou reduzem risco. Todas exigem justificativa no PR e aprovação nesta fase.

| Dependência | Motivo | Alternativa sem ela | Impacto |
| --- | --- | --- | --- |
| `uuid` (v7) | IDs ordenáveis por tempo, padrão RFC 9562 | ULID caseiro ou UUIDv4 | Índices melhores; 1 dep pequena |
| `@simplewebauthn/server` + `/browser` | Passkeys corretas e auditadas | Implementar WebAuthn manualmente | Evita erros crípticos de segurança; suporta Workers |
| `react-router` | Rotas da SPA | Roteador caseiro | **Adotada na Entrega 4**; necessário para deep links/PWA |
| `@tanstack/react-query` | Cache, invalidação e estados de rede | Hooks/fetch manuais | Reduz bugs de sincronização; proposto |
| `react-hook-form` + `@hookform/resolvers` | Formulários complexos com Zod | Estado manual | Menos re-renders e validação duplicada; proposto |
| `vitest` + `@cloudflare/vitest-pool-workers` | Testes unitários e de integração no runtime real | Jest/Miniflare manual | Fidelidade ao runtime |
| `@testing-library/react` | Testes de componente | Testes manuais | Acessibilidade e regressões |
| `playwright` | E2E crítico | Nenhum | Custo zero local; rodar em CI seletivamente |
| `eslint` + `prettier` | Qualidade/format | Biome | Ecossistema consolidado |
| `drizzle-kit` | Migrações | SQL manual | Já implícito no Drizzle |

**Não adicionar sem necessidade comprovada:** bibliotecas de estado global (Redux/Zustand), UI kits completos, `moment`, `lodash` inteiro, clientes HTTP pesados (Axios), ORMs alternativos, frameworks SSR (Next/Remix).

## 15. Alternativas rejeitadas

| Alternativa | Motivo da rejeição |
| --- | --- |
| Frontend em Cloudflare Pages + API em Worker separado | CORS/cookies cross-site, dois pipelines, sem ganho nesta escala; assets do Workers já são gratuitos |
| Supabase/Neon/Postgres gratuito | Postgres é melhor, mas adiciona dependência externa, pausas por inatividade e possível cobrança; D1 atende o volume pessoal |
| Banco local no dispositivo (IndexedDB) como fonte da verdade | Sem acesso multi-dispositivo e sem backup confiável; PWA precisa de servidor |
| Microsserviços / multiagente | Complexidade operacional sem necessidade comprovada; proibido pelo briefing |
| Event sourcing completo | Custo de modelagem/replay desproporcional; auditoria + soft delete atende |
| Next.js/SSR | SSR consome CPU no free tier e não é necessário para um app autenticado |
| Firebase | Vendor lock-in, custo imprevisível e modelo de dados menos portável |
| Auth0/Clerk | Serviço pago acima do free; dados de identidade fora do controle do usuário |
| Senha + PBKDF2 | Pode exceder 10 ms de CPU; passkeys são mais seguras e baratas |
| Cloudflare Access como auth principal | Exige domínio próprio (custo) e dificulta testes locais; pode ser camada extra depois |

## 16. Portabilidade e migração futura

- **Dados:** export JSON versionado + CSV; schema SQLite padrão; `wrangler d1 export` para SQL.
- **Lógica:** `packages/domain` puro; trocar D1 por Postgres exige novo schema Drizzle e repositórios, não reescrita de regras.
- **API:** contratos Zod independentes de runtime; Hono roda em Node/Bun/Deno.
- **Frontend:** SPA estática; pode ser hospedada em qualquer CDN.
- **Auth:** passkeys são padrão WebAuthn; migrar exige re-registro se o RP ID mudar.
- **O que dificulta a migração:** SQL específico do SQLite (evitar funções exóticas), uso de bindings Cloudflare fora de `apps/api`, e dependência de R2 para backups (manter export manual).

## 17. Riscos arquiteturais e mitigações

| Risco | Prob. | Impacto | Mitigação |
| --- | --- | --- | --- |
| Estouro dos 10 ms de CPU | Média | Alto | Handlers enxutos, sem KDF caro, agregações prévias, benchmark contínuo, fallback para Workers Paid se necessário (com aprovação) |
| Estouro de 100 mil escritas/dia | Baixa | Alto | Escritas em lote, agregações noturnas, importações throttled, painel de uso |
| Banco > 500 MB | Baixa | Alto | Exportar/arquivar dados antigos; áudio/binários fora do D1; monitorar |
| 100 mil requisições/dia | Baixa | Médio | Assets gratuitos; cache; uso pessoal; monitorar |
| Perda de dados | Baixa | Crítico | Export semanal, Time Travel, teste de restauração trimestral |
| Mudança de limites do free tier | Média | Alto | Arquitetura portátil, plano B documentado, sem dependência de recursos exclusivos |
| Lock-in Cloudflare | Média | Médio | Domínio puro + Drizzle + export; orçamento para migração |
| Passkeys incompatíveis em dispositivo antigo | Baixa | Médio | Códigos de recuperação; suporte a múltiplas passkeys |
| Auth complexa consumir CPU | Média | Alto | Benchmark na Fase 1; fallback Access (requer domínio) ou sessão de longa duração |
| IA vazar dados | Baixa | Crítico | Desabilitada por padrão; consentimento; redaction; nunca enviar segredos |
| Complexidade do monorepo | Baixa | Baixo | 5 pacotes, regras de dependência no CI |
| Bundle ECharts grande | Média | Médio | Imports seletivos, lazy load, budget no CI |

## 18. Custos e limites operacionais (free tier)

Valores verificados na documentação oficial em **2026-11-20**. Limites mudam; revisar trimestralmente.

| Serviço | Limite gratuito | Risco | Plano B |
| --- | --- | --- | --- |
| Workers | 100.000 req/dia; 10 ms CPU/req; 50 subrequests; 5 crons; 128 MB; 20.000 arquivos estáticos; 25 MiB/arquivo | CPU e req/dia | Otimizar; se necessário, US$ 5/mês (requer aprovação; viola R$ 0) |
| Assets estáticos | Requisições gratuitas e ilimitadas | Nenhum relevante | — |
| D1 | 5 mi linhas lidas/dia; 100 mil escritas/dia; 5 GB total; 500 MB/DB; 10 DBs; Time Travel 7 dias; 50 queries/invocação; SQL 100 KB; query 30 s | Escritas, storage | Agregar, arquivar, exportar; banco único |
| R2 | 10 GB-mês; 1 mi Class A/mês; 10 mi Class B/mês; egress grátis | Exige perfil de faturamento | Export manual para disco local |
| Workers Logs | 200 mil eventos/dia; retenção 3 dias (mudança de preço em 01/12/2026) | Diagnóstico limitado | `wrangler tail`, logs mínimos |
| GitHub Free (privado) | 2.000 min Actions/mês; 500 MB Packages; repositório recomendado < 1 GB | CI pode esgotar | CI enxuto; rodar E2E localmente |
| Domínio | `*.workers.dev` grátis | RP ID/marca | Domínio próprio ~US$ 10/ano (decisão pendente) |
| Cloudflare Access (opcional) | Até 50 usuários | Exige domínio próprio | Auth própria por passkeys |

**Custo mensal esperado:** R$ 0, assumindo `workers.dev`, sem R2 e sem domínio próprio. R2 pode exigir cartão; se habilitado dentro do free tier, continua US$ 0, mas há risco de cobrança por engano — configurar alertas e limites.

## 19. Decisões arquiteturais relacionadas

- [ADR-0001](decisions/0001-stack-e-monorepo.md) — Stack e monorepo
- [ADR-0002](decisions/0002-topologia-de-deploy.md) — Worker único com assets + API
- [ADR-0003](decisions/0003-autenticacao.md) — Passkeys
- [ADR-0004](decisions/0004-single-tenant.md) — Single-tenant
- [ADR-0005](decisions/0005-identidade-tempo-dinheiro.md) — IDs, tempo e dinheiro
- [ADR-0006](decisions/0006-contratos-de-api.md) — Contratos REST
- [ADR-0007](decisions/0007-auditoria-e-historico.md) — Auditoria sem event sourcing
- [ADR-0008](decisions/0008-agregacoes-e-limites-d1.md) — Agregações materializadas
- [ADR-0009](decisions/0009-ia-desacoplada.md) — IA opcional e proveniência
- [ADR-0010](decisions/0010-backup-e-exportacao.md) — Exportação e backups
- [ADR-0011](decisions/0011-dominio-e-workers-dev.md) — Domínio e `workers.dev`
