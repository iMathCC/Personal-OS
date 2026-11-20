# Personal OS

Sistema pessoal de gestão e inteligência orientado por dados: objetivos, projetos, atividades, métricas, finanças, estudos, carreira, leituras, treino e bem-estar em um único lugar.

> **Status: Fase 1 — Tarefa 1.1 (bootstrap verificável).** O monorepo sobe, o health check consulta o D1 local e o build da SPA funciona. **Ainda não há autenticação, schema de domínio, migrações, dashboard nem módulos de negócio.** Não use com dados reais nesta etapa.

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
| [AGENTS.md](AGENTS.md) | Regras permanentes para agentes e desenvolvedores |

## Estrutura do monorepo

```text
apps/
  api/        Worker Hono + D1 binding + testes Vitest
  web/        SPA React + Vite + Tailwind v4 + shadcn/ui + PWA
packages/
  shared/     Contratos Zod compartilhados (health e envelope de erro)
docs/         Especificação, arquitetura, roadmap e ADRs
```

`packages/domain` e `packages/db` entram nas próximas tarefas da Fase 1, junto de autenticação e schema.

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
| `npm test` | Testes da API no runtime do Workers (Miniflare) |
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

## Testes e verificação

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

O CI em `.github/workflows/ci.yml` roda exatamente essa sequência com Node 24 e `npm ci`, além de `npm audit --audit-level=high`.

### Medição local (Tarefa 1.1)

Medição em 2026-11-20, Node 24.22.3, `wrangler dev` local, 50 requisições sequenciais ao health check:

| Métrica | Valor |
| --- | --- |
| p50 | 11,4 ms |
| p95 | 15,7 ms |
| Máximo | 18,8 ms |

O tempo é latência de ponta a ponta no runtime local (inclui overhead do Miniflare), não CPU isolada. CPU p95 por rota só é observável no ambiente Cloudflare publicado; deve ser medido após o primeiro deploy e registrado antes de considerar a Fase 1 concluída.

Build da SPA nesta tarefa: **104,29 KB gzip** de JavaScript inicial (limite da Fase 1: 250 KB).


## Deploy (ainda não executado)

`apps/api/wrangler.toml` já declara assets da SPA, fallback `index.html`, roteamento `/api/*` para o Worker e o binding D1. Antes de publicar:

1. Criar o banco e substituir `database_id` pelo ID real (`wrangler d1 create personal-os`).
2. Rodar `npm run build` para gerar `apps/web/dist`.
3. Configurar credenciais Cloudflare no ambiente/CI.

O deploy de produção **não faz parte da Tarefa 1.1** e depende das tarefas seguintes (auth e migrações).

## Limitações conhecidas desta etapa

- Sem autenticação, autorização, CSRF ou rate limit.
- Sem schema de domínio, Drizzle, migrações ou seeds.
- Sem exportação/restauração, backup ou monitoramento de limites D1/Workers.
- Sem módulos de negócio, dashboard ou gráficos.
- PWA instalável e cache somente leitura de GETs; escrita offline não existe.
- `npm run deploy` é apenas um atalho preparado; não foi validado contra a Cloudflare.

## Restrições centrais

- Custo operacional de **R$ 0** (nenhum plano pago, domínio opcional).
- Desktop e celular via **PWA**.
- Dados sob controle do usuário, com **exportação e restauração** nas fases seguintes.
- Aplicação **funcional sem IA externa**.
- Monólito modular, API como única porta de acesso aos dados.
