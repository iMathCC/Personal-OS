# Personal OS

Sistema pessoal de gestão e inteligência orientado por dados: objetivos, projetos, atividades, métricas, finanças, estudos, carreira, leituras, treino e bem-estar em um único lugar.

> **Status: Fase 1 — Tarefa 1.2 (Entrega 2: fundação de persistência).** O monorepo sobe, o health check consulta o D1 local, o build da SPA funciona e o banco local tem 12 tabelas, migrações versionadas, seeds idempotentes e testes de integração. A Entrega 1 (spike WebAuthn) foi aprovada. **Ainda não há endpoints de auth, sessões funcionais, dashboard nem módulos de negócio.** Esta entrega aguarda revisão antes da Entrega 3; não use com dados reais.

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
packages/
  db/         Schema Drizzle, cliente D1, helper UUIDv7, seeds e config do Drizzle Kit
  shared/     Contratos Zod compartilhados (health e envelope de erro)
docs/         Especificação, arquitetura, roadmap, ADRs e spike de WebAuthn
```

As migrações ficam em `apps/api/migrations` (o Wrangler as aplica pelo binding `DB`). `packages/domain` entra em uma tarefa futura da Fase 1, junto das regras de negócio; autenticação e endpoints ainda não foram implementados.

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
| `npm test` | Todos os testes da API no runtime do Workers (Miniflare), incluindo integração de DB |
| `npm run test:integration` | Somente os testes de migração/integridade do banco (`apps/api/test/db`) |
| `npm run db:generate` | Gera uma nova migração SQL a partir do schema Drizzle |
| `npm run db:migrate:local` | Aplica migrações pendentes no D1 local (`DB`) |
| `npm run db:seed:local` | Aplica os seeds idempotentes no D1 local (`DB`) |
| `npm run check` | Formatação + lint + typecheck + testes + build |
| `npm run deploy` | Build da SPA e deploy do Worker (requer configuração Cloudflare) |

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

O CI em `.github/workflows/ci.yml` roda a sequência principal com Node 24 e `npm ci`, além de `npm audit --audit-level=high`. A suíte completa da API (`npm test`) já inclui os 17 testes de integração de banco; `npm run test:integration` é o atalho para executá-los isoladamente.

### Medição local (Tarefa 1.1)

Medição em 2026-11-20, Node 24.22.3, `wrangler dev` local, 50 requisições sequenciais ao health check:

| Métrica | Valor |
| --- | --- |
| p50 | 11,4 ms |
| p95 | 15,7 ms |
| Máximo | 18,8 ms |

O tempo é latência de ponta a ponta no runtime local (inclui overhead do Miniflare), não CPU isolada. CPU p95 por rota só é observável no ambiente Cloudflare publicado; deve ser medido após o primeiro deploy e registrado antes de considerar a Fase 1 concluída.

Build da SPA nesta tarefa: **104,29 KB gzip** de JavaScript inicial (limite da Fase 1: 250 KB).

A Entrega 1 da Tarefa 1.2 validou `@simplewebauthn/server@14.1.0` no Workers com 15 testes de spike (relatório em `docs/spikes/001-webauthn-workers.md`). A Entrega 2 adicionou 17 testes de integração de persistência. As latências locais continuam registradas como **latência**, não CPU: o gate de CPU p95 em ambiente publicado segue pendente antes de considerar a Fase 1 concluída.

## Deploy (ainda não executado)

`apps/api/wrangler.toml` já declara assets da SPA, fallback `index.html`, roteamento `/api/*` para o Worker e o binding D1. Antes de publicar:

1. Criar o banco e substituir `database_id` pelo ID real (`wrangler d1 create personal-os`).
2. Rodar `npm run build` para gerar `apps/web/dist`.
3. Configurar credenciais Cloudflare no ambiente/CI.

O deploy de produção **não faz parte desta entrega** e depende das tarefas seguintes (endpoints de auth e validação em ambiente publicado).

## Limitações conhecidas desta etapa

- Persistência pronta, mas sem endpoints de autenticação, autorização, CSRF ou rate limit.
- Sem sessões funcionais, fluxo WebAuthn completo, bootstrap com `SETUP_TOKEN` ou recuperação de conta.
- `pos_vid` ainda não é usado; quando existir será dado complementar, com IP confiável e hashes com salt ([ADR-0012](docs/decisions/0012-invariantes-operacionais-de-auth.md)).
- Runbook operacional descrito em `docs/SECURITY.md` §14, mas sem endpoints administrativos auditados.
- Sem exportação/restauração, backup ou monitoramento de limites D1/Workers.
- Sem módulos de negócio, dashboard ou gráficos; `packages/domain` ainda não existe.
- PWA instalável e cache somente leitura de GETs; escrita offline não existe.
- `npm run deploy` é apenas um atalho preparado; não foi validado contra a Cloudflare.
- `npm audit` não tem high/critical, mas reporta vulnerabilidades `moderate` em dependências de desenvolvimento (esbuild via drizzle-kit; glob/minimatch via vite-plugin-pwa).

## Restrições centrais

- Custo operacional de **R$ 0** (nenhum plano pago, domínio opcional).
- Desktop e celular via **PWA**.
- Dados sob controle do usuário, com **exportação e restauração** nas fases seguintes.
- Aplicação **funcional sem IA externa**.
- Monólito modular, API como única porta de acesso aos dados.
