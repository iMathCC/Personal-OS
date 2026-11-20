# Roadmap — Personal OS

- **Versão:** 1.0 (Fase 0)
- **Data:** 2026-11-20
- **Status:** Proposta para aprovação

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

## 3. Fase 0 — Planejamento (atual)

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

Aprovação humana das decisões da §8. Sem aprovação, a Fase 1 não inicia.

---

## 4. Fase 1 — Fundação segura

**Objetivo:** colocar no ar um app autenticado, vazio, confiável e recuperável.

### 4.1 Entregáveis

1. **Monorepo npm workspaces** com `apps/web`, `apps/api`, `packages/shared`, `packages/domain`, `packages/db`.
2. **Tooling:** TypeScript estrito, ESLint, Prettier, Vitest, `.nvmrc` (Node 22), scripts raiz (`dev`, `build`, `test`, `typecheck`, `lint`).
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

- **Gate de CPU:** se passkey verification + middleware exceder 10 ms com frequência, decidir entre otimizar, simplificar sessão ou rever auth (ADR-0003) antes de seguir.
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
| D-15 | Node 22 LTS como requisito | Aprovar (ambiente atual tem 18) | Fase 1 | Build falha com Vite atual |

> D-15 é técnico e não deveria bloquear: Node 18 está fora do suporte da stack. Recomenda-se atualizar antes da Fase 1.

---

## 9. Próxima tarefa de implementação (após aprovação)

**Tarefa 1.1 — Bootstrap verificável do monorepo**

1. Criar `package.json` raiz com workspaces e scripts (`dev`, `build`, `lint`, `typecheck`, `test`).
2. Fixar Node 22 em `.nvmrc` e `engines`; configurar TypeScript estrito em `tsconfig.base.json`.
3. Criar `apps/api` com Hono + `GET /api/v1/health` e `wrangler.toml` (D1 binding local).
4. Criar `apps/web` com Vite + React + TS + Tailwind + shadcn/ui, shell mínimo e proxy `/api`.
5. Criar `packages/shared` com o schema Zod do health check e o envelope de erro.
6. Configurar Vitest (unitário) e um teste do health check via `app.request()`.
7. Configurar ESLint/Prettier e CI do GitHub Actions (lint, typecheck, test, build).
8. Documentar comandos no README e registrar a medição de CPU do health check.

**Critério de aceite:** `npm ci && npm run lint && npm run typecheck && npm test && npm run build` passa; `wrangler dev` responde `{"status":"ok"}`; CI verde; nenhuma funcionalidade além do health check.

**Não fazer nesta tarefa:** auth, schema de domínio, migrações, dashboard, deploy de produção.

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
