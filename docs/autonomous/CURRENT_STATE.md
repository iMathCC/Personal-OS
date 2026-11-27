# Current State — Autonomous System

## Snapshot
- Data: 2026-11-27
- Branch: `delivery-25-polish-merge` (dirty, muitas alterações preexistentes preservadas)
- Node: v24.22.3 / npm 11.19.1
- OpenCode: v2.2.6 (`/home/matheus/.opencode/bin/opencode`)
- D35: experiência diária evoluída em `/hoje` e `/revisao-diaria` (próxima ação explicável, ações rápidas iniciar/concluir/adiar com contratos existentes, revisão com planejado/executado/pendente e reflexão local honesta). Evidência: `docs/quality/DELIVERY_35_ACCEPTANCE_EVIDENCE.md`.
- D34/D34.1: planejamento vs execução DTO oficial, longitudinal mínimo, feedback humano mínimo, dashboard E2E independente, C05 determinístico, fault injection E2E; auth E2E estabilizado. Evidência: `docs/quality/DELIVERY_34_ACCEPTANCE_EVIDENCE.md`.
- D33: inteligência operacional/longitudinal. Evidência: `docs/quality/DELIVERY_33_ACCEPTANCE_EVIDENCE.md`.
- D32: integração de produto. Evidência: `docs/quality/DELIVERY_32_ACCEPTANCE_EVIDENCE.md`.

## Delivery 35 (experiência diária)
| Item | Estado | Evidência |
|---|---|---|
| `/hoje` com contexto diário, próxima ação explicável e limitações | PASS | `apps/web/src/features/today/TodayPage.tsx`, `model.ts` |
| Ações rápidas de execução (iniciar/concluir/adiar 1 dia) via contratos existentes | PASS | `use-today.ts` (`tasksApi.update/complete`, Idempotency-Key/If-Match) |
| `/revisao-diaria` com planejado/executado/pendente e reflexão local honesta | PASS | `DailyReviewPage.tsx`, `model.ts` (`deriveDailyReview`) |
| Reflexão diária: sem contrato backend inventado; rascunho localStorage explícito | PASS | `DailyReviewPage.tsx` (rótulo device-local, não enviado à API) |
| Testes unitários modelo hoje/revisão atualizados | PASS | `apps/web/test/today-model.test.ts` (13 passed) |
| Validações gerais D35 | PASS | format/lint/typecheck/test/integration/e2e/build/db:generate/backup:drill/deploy:check verdes; e2e 15 passed/3 skipped/0 failed |

## Delivery 34 (planejamento vs execução + longitudinal + feedback mínimo)
| Item | Estado | Evidência |
|---|---|---|
| DTO planejamento vs execução oficial no servidor (`planning-execution-v1`) | PASS | `packages/domain/src/planning-execution.ts`, `packages/shared/src/decision.ts`, `apps/api/src/modules/decision/service.ts` |
| Estados exigidos, contrato completo, sem % em base/período não equivalente | PASS | Testes domínio + API; `not_applicable` para capacidade em período não-7d |
| Frontend apresentação apenas | PASS | `DecisionDashboardView.tsx` consome `dashboard.planningExecution` |
| Longitudinal no dashboard principal reaproveitando performance | PASS (mínimo) | `longitudinalIndicators`; tendência suprimida com <4 semanas comparáveis; sem gap-fill/zero inventado |
| Feedback humano mínimo integrado (aceitar/rejeitar/adiar) | PASS (mínimo) | `humanFeedback` no DTO/dashboard; nota: decisão não equivale a resultado observado; sem execução automática |
| Dashboard E2E independente | PASS | `apps/web/e2e/dashboard.spec.ts` injeta sessão D1 quando setup concluído |
| C05 duplo clique determinístico | PASS | `apps/web/e2e/adaptation.spec.ts` (1 POST, 1 decisão, dialog fecha, histórico visível) |
| Fault injection E2E reutilizável 429/500/timeout | PASS | `apps/web/e2e/helpers/fault-injection.ts` |
| Validações locais | PASS com ressalva E2E | format/lint/typecheck/test/integration/build/db:generate/backup:drill/deploy:check PASS; e2e 14 passed/1 failed (`auth.spec.ts`, não relacionada ao D34)/3 skipped |

## Delivery 33 (inteligência operacional e longitudinal)
| Item | Estado | Evidência |
|---|---|---|
| Dashboard E2E visual (visão integrada, cobertura, período/fuso, recomendações/alertas, 360px, resiliência 429/500/timeout) | PASS (standalone, env limpo) | `apps/web/e2e/dashboard.spec.ts`, `/tmp/opencode/d33-dashboard-fi.log` |
| Correção bug real fetchHealth (raw vs envelope) | PASS | `apps/web/src/lib/api.ts`; causa raiz reproduzida por E2E |
| Planejamento vs execução enriquecido com fatos do servidor/caveats | PASS/PARTIAL | Evoluído em D34 para DTO oficial do servidor; D33 view enriquecida foi substituída por consumo do DTO |
| Inteligência longitudinal | PASS (mínimo D34) | `longitudinalIndicators` no dashboard principal, reaproveitando domínio performance; sem segundo motor |
| Priorização contextual/feedback | PASS (mínimo D34) | `humanFeedback` agregado no dashboard; sem execução automática; feedback completo ainda não expandido |
| D31 C02 stale-version | PASS | `apps/api/test/d33/retakes.test.ts` |
| D31 C03 idempotency replay | PASS | `apps/api/test/d33/retakes.test.ts` |
| D31 C05 double-click protection | PASS (servidor + E2E determinístico D34) | `apps/api/test/d33/retakes.test.ts`, `apps/web/e2e/adaptation.spec.ts` |
| D31 D01 400 validation | PASS | `apps/api/test/d33/retakes.test.ts` |
| D31 D02 401 unauthenticated | PASS | `apps/api/test/d33/retakes.test.ts` |
| Fault injection 429/500/timeout | PASS (UI local controlado) | `apps/web/e2e/dashboard.spec.ts` + helper reutilizável D34 |
| Validações locais completas | PASS (D33) / ressalvas D34 | ver seção D34 |

## Delivery 32 (integração de produto e inteligência cross-domain)
| Item | Estado | Evidência |
|---|---|---|
| Visão integrada no dashboard principal | PASS | `apps/web/src/features/dashboard/use-dashboard.ts`, `DashboardPage.tsx` reutilizam `decisionApi.lifeDashboard` + `DecisionDashboardView` |
| Planejamento vs execução | PASS (dados disponíveis) | Seção "Planejamento vs execução" em `DecisionDashboardView.tsx`; limitações explícitas quando sem meta/plano |
| Inteligência cross-domain/recomendações/próxima ação explicáveis | PASS | `DecisionDashboardView.tsx` exibe recomendações/alertas com evidência; cross-domain com `causality: not_claimed` |
| Testes funcionais integrados D32 | PASS | `apps/api/test/d32/product-integration.test.ts` (6 passed) |
| Validações gerais D32 | PASS | format/lint/typecheck/test/test:integration/test:e2e/build/db:generate/backup:drill/deploy:check verdes; logs `/tmp/opencode/d32-*` |
| Autonomia/orquestrador | sem expansão | manutenção apenas; sem sessão 2h; sem 18h; Safety Guard não é sandbox |

## Delivery 31 (fechamento D28 + hardening Phase 6)
| Item | Estado | Evidência |
|---|---|---|
| Jornadas A-D browser sintético | PASS/PARTIAL/NOT TESTED | `docs/quality/DELIVERY_31_ACCEPTANCE_EVIDENCE.md`, `/tmp/opencode/d31-evidence/api/d31-acceptance-report.json`, screenshots `/tmp/opencode/d31-evidence/screenshots/` |
| Adaptação aceitar/rejeitar/adiar em 3 propostas pendentes distintas | PASS | month `1h8fa06` accept, week `nds3n2` reject, quarter `n8cfrh` defer; confirmação, persistência, reload, histórico, sem execução automática |
| Consistência/erros (400/401/403/404/409/429/500/timeout/idempotência/stale/double-click/missing/reload/integridade) | PASS/PARTIAL/NOT TESTED | 403/404/409/reload/integridade/ausência explícita PASS; 400/401/stale/idempotência/double-click PARTIAL por automação; 429/500/timeout NOT TESTED |
| SIGKILL recovery CLI (disposable local) | PASS | `/tmp/opencode/d31-evidence/phase6/sigkill-cli-summary.md`: lock+state persistiram; recover-lock órfão; recover marcou interrupted sem auto-reenqueue; run-next sem reexecução |
| Política explícita de revalidação/retomada | PASS | `resolve-interrupted --decision revalidate|resume|abandon`; `resume/revalidate` exigem checks/evidence; resoluções persistidas em `interruptedResolutions` |
| Reboot real/power loss | NOT TESTED | ambiente não controlado/seguro; não simulado como real |
| Sessão autônoma controlada 2h | NOT STARTED | readiness avaliada no relatório D31; não executada |
| Suporte 18h | NÃO COMPROVADO | proibido alegar |

## Delivery 28 (status consolidado)
| Item | Estado | Evidência |
|---|---|---|
| Ambiente Node 24 | validado | Node v24.22.3 |
| Validação D27 (format/lint/typecheck/test/build/db/drill/deploy/dry-run) | validado em sessões anteriores; rerun D31 parcial (ver relatório) | logs D31 |
| E2E repo | validado anteriormente (13 passed, 1 skipped); rerun D31 conforme relatório final | logs D31 |
| Persistência objetivo | PASS | D31 A01-A13 |
| Adaptação aceitar/rejeitar/adiar em fluxo completo | PASS | D31 C accept/reject/defer |
| Jornadas A-D completas com todas asserções | PARCIAL | gap crítico adaptação fechado; alguns casos de erro/automação PARTIAL/NOT TESTED |

## Delivery 29 Phase 1
| Item | Estado |
|---|---|
| Project Brain | implementado |
| Orchestrator/Planner/State/Safety/QualityGate/Adapter/CLI | implementado |
| Testes unitários autonomous | implementado (40 passando no pacote autonomous em D31) |
| Ciclo real controlado OpenCode | comprovado (D29-DEMO-001, sessão real, exit 0) |
| Suporte 18h | não implementado/não comprovado |

## Delivery 30 Phase 2
| Item | Estado | Nível |
|---|---|---|
| Lockfile com PID/sessão/horário/estado | implementado | testado |
| Exclusão mútua (2ª instância bloqueada) | implementado | testado |
| Detecção lock órfão/PID inexistente/corrompido/incompleto | implementado | testado; PID reuse limitação conhecida |
| Recuperação explícita lock (`recover-lock`, `--force`) | implementado | testado |
| Sem remoção automática de lock ativo | implementado | testado |
| SIGINT/SIGTERM com liberação de lock | implementado | testado parcialmente (subprocesso) |
| Git snapshot antes/depois por missão | implementado | testado |
| Distinção preexistente/mission/unexpected | implementado | testado |
| Bloqueio por alteração fora do escopo | implementado | testado |
| Relatório persistente por missão | implementado | testado |
| Histórico consultável com custo/relatório | implementado | testado |
| Recuperação de interrupção sem auto-reenvio | implementado | testado (incl. SIGKILL CLI D31) |
| Resolução explícita de missão interrompida (`resolve-interrupted`) | implementado | testado (D31) |
| Interrupção real de processo (SIGKILL) | implementado | testado em subprocesso local; reboot real NOT TESTED |
| Safety Guard reforçado (padrões + credenciais + allowlist de escopo) | implementado | testado; **não é sandbox** |
| Limites de sessão/falhas/no-progress/intervalo/auto-pause | implementado | testado |
| CLI estendida (report/lock/recover-lock/cost/limites/resolve-interrupted) | implementado | testado por smoke/manual/unit |
| Jornadas D28 A-D completas | PARCIAL | D31 fechou gap crítico; ver limitações |
| Suporte 18h | não implementado/não comprovado | — |