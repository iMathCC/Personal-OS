# Roadmap — Personal OS

- **Versão:** 1.0 (Fase 0)
- **Data:** 2026-11-20
- **Status:** Fase 0 aprovada; Fase 1 em execução (progresso em §9)

O roadmap é organizado em **entregas verificáveis**, não em datas. Cada fase termina com critérios objetivos e o projeto deve permanecer executável ao final de cada etapa. Nenhuma fase começa sem aprovação da anterior.

---

## 1. Princípios de execução

1. **Vertical slices:** cada fase entrega algo utilizável de ponta a ponta (UI + API + banco + teste).
2. **Sem big bang:** módulos entram quando o núcleo estiver estável.
3. **Definição de pronto:** código + testes + documentação + deploy funcionando + critérios de aceite verificados.
4. **Medir antes de otimizar:** CPU, bundle, queries e uso de cota são medidos desde a Fase 1.
5. **Decisões registradas:** toda escolha relevante vira ADR; mudanças de rumo são explícitas.
6. **Nada de dependência paga:** qualquer necessidade de plano pago é uma decisão humana, não uma surpresa.

---

## 2. Visão das fases

| Fase | Nome | Resultado | Depende de |
| --- | --- | --- | --- |
| 0 | Planejamento | Especificação, arquitetura, modelo, segurança e roadmap aprovados | — |
| 1 | Fundação segura | App implantado, autenticado, com exportação e CI | Fase 0 aprovada |
| 2 | Núcleo operacional | Objetivos, projetos, tarefas, eventos, check-ins e dashboard v1 | Fase 1 |
| 3 | Métricas e análise | Métricas, agregações, gráficos, tendências e correlações | Fase 2 |
| 4 | Módulos de vida | Finanças, estudos, carreira, leitura, treino, bem-estar e hábitos | Fase 3 |
| 5 | Inteligência | Projeções, recomendações determinísticas e IA opcional | Fase 4 |
| 6 | Automação e maturidade | Backups, importação, integrações, offline avançado e hardening | Fase 5 |

---

## 3. Fase 0 — Planejamento (concluída)

### Entregáveis

- [x] Análise de requisitos e ambiguidades (`PRODUCT_SPEC.md`).
- [x] Verificação de compatibilidade da stack com Cloudflare (`ARCHITECTURE.md` §13).
- [x] Identificação de riscos de limites gratuitos (`ARCHITECTURE.md` §18).
- [x] Arquitetura lógica, topologia e monorepo (`ARCHITECTURE.md`).
- [x] Modelo de dados inicial (`DATA_MODEL.md`).
- [x] Contratos iniciais da API (`API_CONTRACTS.md`).
- [x] Requisitos de segurança (`SECURITY.md`).
- [x] Estratégia de testes (este documento §5).
- [x] Fases de desenvolvimento (este documento).
- [x] Decisões pendentes de aprovação (este documento §8).
- [x] ADRs (`docs/decisions/`).
- [x] `AGENTS.md`.

### Critério de conclusão

Especificação coerente, arquitetura documentada, modelo revisado, roadmap verificável e decisões pendentes explícitas. **Não há código de aplicação.**

### Saída

Aprovação humana das decisões da §8. Registro: Fase 0 aprovada e Tarefa 1.1 aprovada (commit `7b9e93c`). Permanecem **não aprovadas** as decisões D-13 (retenção de auditoria) e D-14; não devem ser tratadas como aprovadas.

---

## 4. Fase 1 — Fundação segura

**Objetivo:** colocar no ar um app autenticado, vazio, confiável e recuperável.

### 4.1 Entregáveis

1. **Monorepo npm workspaces** com `apps/web`, `apps/api`, `packages/shared`, `packages/domain`, `packages/db`.
2. **Tooling:** TypeScript estrito, ESLint, Prettier, Vitest, `.nvmrc` (Node 24), scripts raiz (`dev`, `build`, `test`, `typecheck`, `lint`).
3. **Worker + Hono** com:
   - `/api/v1/health`;
   - middleware de request ID, erros, headers de segurança, body limit;
   - D1 binding, Drizzle e migração inicial;
   - assets da SPA e fallback `index.html`.
4. **Autenticação por passkeys:**
   - bootstrap com `SETUP_TOKEN`;
   - login/logout, sessões, códigos de recuperação;
   - rate limit de auth;
   - auditoria de eventos de auth.
5. **Entidades mínimas:** `users`, `sources`, `areas`, `audit_log`, `sessions`, `passkeys`, `recovery_codes`, `auth_challenges`, `rate_limits`, `idempotency_keys`.
6. **Exportação/restauração** em JSON (banco vazio) com dry-run.
7. **Frontend:** shell responsivo, login, setup, página de áreas, tela de exportação, estados de erro/offline, PWA instalável.
8. **CI/CD:** lint + typecheck + testes + build + deploy em `main`; workflow separado de migração com aprovação.
9. **Observabilidade mínima:** logs estruturados, `X-Request-Id`, `job_runs` (estrutura).
10. **Documentação operacional:** como rodar localmente, configurar Cloudflare, aplicar migrações, restaurar backup.

### 4.2 Critérios de aceite (verificáveis)

- [ ] `npm ci && npm run lint && npm run typecheck && npm test && npm run build` passa do zero.
- [ ] `wrangler dev` sobe app + API localmente com D1 local.
- [ ] Deploy em `*.workers.dev` acessível por HTTPS em desktop e celular.
- [ ] Primeiro acesso só funciona com `SETUP_TOKEN`; após setup, endpoint retorna 409/403.
- [ ] Login por passkey funciona em Chrome desktop e Safari/iOS (ou Android).
- [ ] Código de recuperação funciona uma vez e invalida sessões.
- [ ] Sessão revogada deixa de acessar a API imediatamente.
- [ ] CSRF: POST sem `Origin`/token é rejeitado.
- [ ] Rate limit de login retorna 429 após o limite.
- [ ] Export JSON contém `exportVersion`, `schemaVersion`, counts e checksum.
- [ ] Restauração em D1 local limpo reproduz contagens e vínculos.
- [ ] Lighthouse: PWA instalável; acessibilidade ≥ 90 nas telas iniciais.
- [ ] Bundle inicial ≤ 250 KB gzip.
- [ ] CPU p95 das rotas de auth medida e documentada; nenhuma rota > 10 ms em benchmark local.
- [ ] `npm audit` sem high/critical.
- [ ] Nenhum segredo no repositório (`grep` + revisão).
- [ ] Migração aplicada do zero e a partir do schema anterior.
- [ ] README operacional permite um novo ambiente em < 30 min.

### 4.3 Fora da Fase 1

Dashboards, tarefas, métricas, módulos de vida, projeções, recomendações, IA, R2 obrigatório, notificações.

### 4.4 Riscos/gates

- **Gate de CPU:** se passkey verification + middleware exceder 10 ms com frequência, decidir entre otimizar, simplificar sessão ou rever auth (ADR-0003) antes de seguir. Ainda não medido em ambiente publicado (ver §9.2); medições locais são latência, não CPU.
- **Gate de domínio:** se o usuário quiser domínio próprio, decidir **antes** do cadastro de passkeys (RP ID é estável).

---

## 5. Estratégia de testes

### 5.1 Pirâmide

| Nível | Ferramenta | Escopo | Meta |
| --- | --- | --- | --- |
| Unitário de domínio | Vitest | Finanças, agregações, estatística, projeções, regras | ≥ 90% linhas em `packages/domain` |
| Contratos | Vitest + Zod | Schemas de entrada/saída, erros, versionamento | 100% dos schemas com caso válido/inválido |
| Integração de API | `@cloudflare/vitest-pool-workers` + D1 local | Rotas, auth, auditoria, migrações | Fluxos críticos por módulo |
| Componentes | Testing Library | Formulários, estados, acessibilidade básica | Fluxos principais |
| E2E | Playwright | Setup, login, CRUD, export/restore, offline | 5–8 cenários críticos |
| Migração | Script + D1 local | From scratch + upgrade | Toda migração |
| Performance | Script de benchmark + Lighthouse | CPU, bundle, p95 | Budgets da §7 |
| Segurança | Testes negativos | CSRF, authz, rate limit, XSS, SQLi | Casos do SECURITY.md |

### 5.2 Regras

- Relógio injetável (`Clock`) e PRNG semeado para determinismo.
- Fixtures sem PII real; dados sintéticos.
- Testes de regressão para todo bug corrigido.
- Sem testes dependentes de ordem/rede; integração usa D1 local.
- E2E em CI apenas em `main`/manual (custo de minutos); local no dia a dia.
- Cobertura não é meta isolada; regras críticas exigem testes independentemente do percentual.
- Teste de restauração: exportar → apagar banco local → importar → comparar counts/checksums.
- Teste de auditoria: mutação e log atômicos; update concorrente não gera log órfão.

### 5.3 CI (alvo < 5 min)

1. `npm ci`
2. `lint` + `typecheck`
3. `test` (unit + contracts)
4. `test:integration` (D1 local)
5. `build` + bundle budget
6. (main) deploy
7. (manual) migração

---

## 6. Fases 2–6 em detalhe

### Fase 2 — Núcleo operacional

**Entregáveis**

- CRUD de áreas, objetivos, projetos, tarefas e eventos.
- Check-in diário.
- Visões diária/semanal/mensal.
- Dashboard v1 com 6–8 widgets definidos na aprovação.
- Histórico de auditoria visível.
- Busca simples e filtros.
- Testes de regras (status, hierarquia, recorrência básica).

**Aceite**

- Ciclo completo: criar objetivo → projeto → tarefas → concluir → ver progresso.
- Check-in único por dia, editável.
- Dashboard reflete dados em < 2 s (4G simulado).
- Nenhuma rota de dashboard faz varredura completa de tabelas.
- Acessibilidade e mobile validados nos fluxos principais.

### Fase 3 — Métricas e análise

**Entregáveis**

- Definições de métricas + observações + correção.
- Agregações diárias/semanais/mensais (`metric_daily`) + cron.
- Gráficos ECharts (linha, barra, área, heatmap) com lacunas explícitas.
- Tendência, médias móveis, variação, correlação com n e ressalvas.
- Drill-down de indicador.
- Painel de metas vs realizado.
- Seed de métricas a partir de check-ins/bem-estar (sem duplicar fatos).

**Aceite**

- Recalcular período produz resultado idêntico (teste golden).
- Observação supersedida não entra em agregados.
- Cron noturno executa em < 10 s de CPU.
- Gráficos não bloqueiam o bundle inicial (lazy).
- Correlação exibe n e aviso de causalidade.

### Fase 4 — Módulos de vida

Ordem sugerida (uma entrega por módulo, com aceite próprio):

1. **Finanças** (maior valor e maior risco): contas, categorias, transações, transferências, importação CSV, resumo mensal, patrimônio.
2. **Treino:** exercícios, treinos, séries, volume semanal.
3. **Leitura:** livros, sessões, progresso.
4. **Estudos:** cursos, sessões, horas.
5. **Bem-estar e hábitos:** medições, hábitos, logs, taxa de conclusão.
6. **Carreira:** competências, projetos, vínculos.

**Aceite por módulo**

- CRUD + listagem filtrável + export CSV.
- Regras de domínio testadas (ex.: transferência balanceada, páginas coerentes).
- Widget no dashboard da área.
- Nenhum módulo acessa dados de outro diretamente; dashboards compõem via API.
- Migração e índices revisados.

### Fase 5 — Inteligência

**Entregáveis**

- Projeções lineares/compostas/Monte Carlo com metadados e faixas.
- Cenários e comparação.
- Motor de regras de recomendações com evidências.
- Estados de recomendação e feedback.
- Interface opcional de LLM (BYOK), desabilitada por padrão, com redaction e auditoria.
- Testes de reprodutibilidade (mesmo input/seed → mesmo output).

**Aceite**

- Projeção exibe método, premissas, horizonte, incerteza e `inputHash`.
- Mudança de dados marca projeção como `stale`.
- Recomendação sem evidência é rejeitada pelo schema.
- Com IA desligada, todos os testes de aceite passam.
- Nenhuma chamada externa ocorre sem consentimento registrado.

### Fase 6 — Automação e maturidade

**Entregáveis**

- Backup semanal em R2 (opcional) + verificação + rotação.
- Importação de planilhas com mapeamento.
- Integrações com referência externa idempotente (quando houver fonte gratuita).
- Offline avançado (avaliar fila de mutações e resolução de conflitos).
- Painel de uso de cotas.
- Hardening de segurança, revisão de dependências, runbooks.
- Teste de restauração trimestral documentado.

**Aceite**

- Backup restaurável e teste documentado.
- Nenhuma integração quebra o functioning offline do núcleo.
- Uso mensal dentro do free tier por 30 dias consecutivos.
- Runbooks de incidente e restauração revisados.

---

## 7. Orçamentos e critérios de desempenho

| Métrica | Budget | Onde medir |
| --- | --- | --- |
| CPU por requisição (p95) | < 8 ms; nenhuma > 10 ms | benchmark local + logs |
| Queries por requisição | ≤ 8 | revisão + testes |
| p95 API (sem rede) | < 500 ms | testes de integração |
| Bundle inicial | ≤ 250 KB gzip | CI |
| Chunk de gráficos | ≤ 300 KB gzip | CI |
| Dashboard inicial (4G) | < 2 s | Lighthouse |
| Cobertura de domínio | ≥ 90% | CI |
| Tempo de CI | < 5 min | GitHub Actions |
| Escritas D1/dia | < 50% do limite free | painel/logs |
| Armazenamento D1 | < 50% de 500 MB | monitoramento mensal |

---

## 8. Decisões pendentes de aprovação humana

| ID | Decisão | Recomendação | Bloqueia | Consequência se adiada |
| --- | --- | --- | --- | --- |
| D-01 | Autenticação por passkeys + códigos de recuperação | Aprovar | Fase 1 | Sem auth não há app seguro |
| D-02 | Single-tenant (um usuário) | Aprovar | Modelo/API | Multiusuário mudaria schema e auth |
| D-03 | Domínio próprio ou `*.workers.dev` | `workers.dev` inicialmente | Cadastro de passkeys | Trocar depois exige re-registrar passkeys |
| D-04 | Escopo financeiro: manual + CSV, sem Open Finance | Aprovar | Fase 4 | Integração bancária adicionaria custo/complexidade |
| D-05 | Offline somente leitura na v1 | Aprovar | Fase 1/6 | Escrita offline exige sync/conflitos |
| D-06 | Sem e-mail/push de servidor; lembretes in-app | Aprovar | Fases 2/6 | Push/e-mail adicionam dependências e custo |
| D-07 | R2 opcional para backup (pode exigir cartão) | Habilitar só se aceitável; fallback manual | Fase 6 | Sem R2, backup é manual |
| D-08 | IA externa desabilitada por padrão (BYOK) | Aprovar | Fase 5 | IA obrigatória violaria R$ 0 e privacidade |
| D-09 | Horizontes de objetivo (90/365 dias) | Aprovar como padrão configurável | Fase 2 | Ajuste simples depois |
| D-10 | Campos do check-in diário | Aprovar lista da PRODUCT_SPEC §9/Q-05 | Fase 2 | Schema pode mudar com uso |
| D-11 | Indicadores do dashboard v1 | Definir 6–8 na aprovação | Fase 2 | Dashboard genérico demais |
| D-12 | Moeda BRL única, sem câmbio | Aprovar | Fase 4 | Multi-moeda exige taxas e regras |
| D-13 | Retenção de auditoria 12 meses | Aprovar | Fase 1 | Ajuste de job |
| D-14 | Adoção de `@tanstack/react-query` e `react-hook-form` | Aprovar | Fase 2 | Mais código manual, mais bugs |
| D-15 | Node 24 LTS como requisito | Aprovado (alterado pelo usuário) | Fase 1 | Build falha com Vite atual |

> D-15 foi aprovada com alteração: **Node.js 24 LTS** (não 22). Fixado em `.nvmrc`, `engines.node` (`>=24 <25`) e CI.

---

## 9. Progresso da Fase 1 e próxima tarefa

### 9.1 Concluído e aprovado

**Tarefa 1.1 — Bootstrap verificável do monorepo** (commit `7b9e93c`): workspaces, Node 24, TypeScript estrito, Hono + `/api/v1/health`, SPA Vite/React, Vitest, ESLint/Prettier, CI e README operacional.

**Tarefa 1.2 — Entrega 1 (spike WebAuthn/Workers):** compatibilidade de `@simplewebauthn/server@14.1.0` verificada no runtime Workers com 15 testes; relatório em `docs/spikes/001-webauthn-workers.md`. Sem polyfill nem imports `node:*`.

**Tarefa 1.2 — Entrega 2 (fundação de persistência): aprovada.**

1. `packages/db` com schema Drizzle de 12 tabelas, cliente D1, helper UUIDv7 e exports tipados.
2. Migrações versionadas em `apps/api/migrations`: `0000_init.sql`, `0001_audit_append_only.sql`, `0002_audit_no_replace.sql`, com journal do Drizzle Kit. Migrações aplicadas não são editadas; correções viram nova migração.
3. Banco do zero e upgrade validados em D1 local; seeds idempotentes (4 fontes de sistema + 8 áreas).
4. FKs com índice, checks de enums/formatos, auditoria append-only no banco, limite de 10 sessões ativas no estado final e padrão atômico `UPDATE ... AND version=?` + `INSERT ... SELECT ... WHERE changes()=1` no mesmo `db.batch()`.
5. Testes de integração em `apps/api/test/db` com binding descartável `DB_TEST`: 17 testes cobrindo schema, migração em sequência, FKs, unicidade, NOT NULL, índices em consultas críticas, CRUD e seeds.
6. Documentação atualizada: `DATA_MODEL.md`, `ARCHITECTURE.md`, `SECURITY.md` (runbook §14), ADRs 0006/0007 e novo ADR-0012.

### 9.2 Concluído, aguardando revisão

**Tarefa 1.2 — Entrega 3 (fundação de autenticação):**

1. Domínio puro em `packages/domain`: política de sessões/TTL/LRU, contadores WebAuthn, rate limit, segurança e erros tipados — 20 testes unitários.
2. Contratos Zod em `packages/shared/src/auth.ts`, consumidos por API e frontend; nenhuma duplicação de shape.
3. API: `GET /auth/csrf` e endpoints de setup, login, logout, logout-all, recuperação e gerenciamento de sessões em `/api/v1/auth/*`, com cookies `__Host-pos_session` (256 bits, SHA-256 no banco, 90 dias), `pos_csrf` e `pos_vid`.
4. Middlewares: contexto com sessão validada no D1 a cada requisição, allowlist de `Origin`, CSRF assinado (session/anon), `Content-Type` JSON, body limit de 16 KB, rate limits concretos com `Retry-After` e falha fechada, request ID e headers seguros.
5. WebAuthn com `@simplewebauthn/server@14.1.0`: UP/UV obrigatórios, challenge de uso único (10 min), contador crescente/zero aceito e igual/regressivo auditado como anomalia; falhas de verificação retornam `401`, consumo duplo retorna `409`.
6. Recuperação: 10 códigos de 128 bits exibidos uma vez, token de 256 bits por 10 min, uso único, sem criação de sessão; runbook administrativo sem bypass em `docs/operations/admin-recovery.md`.
7. Atomicidade: mutação + auditoria no mesmo `db.batch()`, guards `UNIQUE`/`changes()=1` para challenges, códigos e limite de 10 sessões (LRU). Testes de concorrência cobrem challenge duplo, código duplo e 14 logins simultâneos.
8. Frontend mínimo: setup, login, recuperação, exibição única dos códigos, confirmação, logout, listagem/revogação de sessões; token CSRF em memória, limpeza de caches privados no logout e service worker sem cache de `/api/v1/auth/*`.
9. Testes: domínio + API (80 no total), incluindo integração, segurança, concorrência e E2E em nível de Worker com autenticador virtual (`app.request` + D1 real, sem Playwright). Nenhuma migração nova; nenhuma dependência paga.

**Tarefa 1.2 — Entrega 4 (App Shell e dashboard inicial), em revisão local:**

1. App Shell com sidebar desktop, drawer mobile, header contextual, skip link, foco visível e estados ativo/hover/foco; dez itens de navegação em três grupos (`Núcleo`, `Áreas da vida`, `Sistema`).
2. O bootstrap de sessão foi extraído para `useSession` (`loading | anonymous | authenticated | error`), preservando WebAuthn, cookie HttpOnly, CSRF em memória e a limpeza de caches no logout. `401` é tratado como sessão expirada; falha de rede mostra erro com retry.
3. Roteamento com `react-router` (dependência já prevista no [ADR-0001](decisions/0001-stack-e-monorepo.md)): deep links, botão voltar, `NavLink` ativo e rota `*` para 404. Somente Visão geral e Configurações são módulos disponíveis; os demais renderizam páginas "Em preparação"/"Não configurada".
4. Dashboard com dados reais de `GET /auth/me` e `GET /health`: saudação, data no fuso do usuário, ciclo do produto, cards de áreas com status derivado, e seções de Objetivos, Atividade recente e Atenção/prioridades com estados vazios explicativos. Nenhum alerta, pontuação, recomendação ou gráfico simulado.
5. Gestão de sessões movida para `/configuracoes`, preservando listagem, revogação e logout (nesta/all) da Entrega 3.
6. Design system escuro com tokens Tailwind v4, ícones SVG próprios e componentes de loading/erro/vazio; cores do manifest PWA alinhadas ao tema.
7. 14 testes no frontend (navegação, status, formatação no fuso do usuário e estados de interface) via Vitest + renderização SSR; nenhuma dependência nova de teste. Nenhum endpoint, schema, migration ou secret novo.

**Fora do escopo das entregas 3 e 4:** CRUD de negócio, motor de recomendações, export/restauração, R2, Cron Triggers, deploy e E2E browser-driven (Playwright).

**Gate pendente:** CPU p95 em ambiente publicado ainda não medido; latências locais do spike e do health check não são CPU. O gate da §7 permanece aberto.

### 9.3 Próximo passo

Aguardar **revisão explícita das Entregas 3 e 4**. A próxima tarefa da Tarefa 1.2 só será detalhada e iniciada após essa aprovação; não antecipar escopo, dependências ou schema além do já decidido em ADR.

---

## 10. Definition of Done (todas as fases)

- Código revisado e tipado (sem `any` injustificado).
- Testes relevantes verdes; nenhum teste ignorado silenciosamente.
- Migrações testadas (from scratch + upgrade) e documentadas.
- Auditoria/proveniência implementadas para dados de domínio.
- Segurança revisada (checklist do SECURITY.md).
- Performance dentro dos budgets.
- Documentação atualizada (incluindo ADR, se decisão estrutural).
- Deploy funcionando em produção ou ambiente de prévia.
- Rollback/recuperação possível por backup.
- Critérios de aceite da fase demonstrados, não presumidos.
