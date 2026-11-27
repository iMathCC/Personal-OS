# Delivery 35 — Acceptance Evidence

## Resumo
- Data: 2026-11-27
- Branch: `delivery-25-polish-merge` (worktree dirty/preexistente preservado)
- Baseline git: `/tmp/opencode/git-before-d35.txt` (231 linhas)
- Escopo: evolução da experiência diária em `/hoje` e `/revisao-diaria`, sem novos subsistemas, sem endpoints/entidades inventadas, sem deploy/remote.

## Implementação

### P0 — Centro de comando diário (`/hoje`)
- Próxima ação recomendada destacada com origem, evidência, motivos/regra e limitações. Sem urgência inventada, sem execução automática.
- Quando não há evidência suficiente, UI orienta escolha manual (tarefas/objetivos) e não inventa sugestão.
- Ações rápidas de execução para itens com `taskId`+`version`: Iniciar (`tasksApi.update` status `in_progress`), Concluir (`tasksApi.complete`), Adiar 1 dia (`tasksApi.update` dueDate +1 dia local). Idempotency-Key e If-Match/version preservados.
- Feedback de sucesso/erro após ação; recarrega dados.
- Indicadores, capacidade, sinais de execução, captura rápida e contexto/histórico mantidos.

### P0 — Redução de atrito
- Captura rápida existente (tarefa/sessão de estudo) mantida; validação antes de mutar.
- Ações rápidas no próprio `/hoje` reduzem navegação para concluir/iniciar/adiar tarefas priorizadas.

### P1 — Revisão diária (`/revisao-diaria`)
- Seções: Planejado/relevante hoje, Executado, Pendente/transferir, Fatos, Cálculos, Recomendações, Cobertura/limitações.
- Comparação planejamento vs execução derivada de dados disponíveis (tarefas com prazo hoje/em andamento/atrasadas/concluídas). Limitações explícitas quando dados ausentes.
- Reflexão curta: rascunho local do dispositivo (`localStorage`), claramente rotulado como não enviado ao backend/não sincronizado. Botão "Salvar rascunho local" e "Salvar reflexão na revisão semanal" (contrato existente). Nenhum endpoint/entidade inventada.

### P1 — Estados vazios / primeira experiência
- Sem recomendação: mensagem honesta + caminhos manuais.
- Seções de revisão exibem mensagens vazias claras.
- Limitações e cobertura explícitas.

## Testes adicionados/atualizados
- `apps/web/test/today-model.test.ts`: taskStatus em prioridade, `addLocalDays`, `taskStatusLabel`, planejado/executado/pendente na revisão, revisão sem evidência com limitações honestas.

## Validações
| Comando | Resultado | Evidência |
|---|---|---|
| format:check | PASS | execução local 2026-11-27 |
| lint | PASS | execução local 2026-11-27 |
| typecheck | PASS | execução local 2026-11-27 |
| test | PASS | web 23/121, api 44/247, autonomous 8/40 (`/tmp/opencode/d35-npm-test-bg.log`) |
| test:integration | PASS | 14/53 (`/tmp/opencode/d35-test-integration.log`) |
| test:e2e | PASS | 15 passed, 3 skipped, 0 failed (`/tmp/opencode/d35-test-e2e.log`) |
| build | PASS | `/tmp/opencode/d35-build3.log` |
| db:generate | PASS | sem mudanças de schema |
| backup:drill | PASS | `/tmp/opencode/personal-os-drill-ruFyO8/drill-summary.json` |
| deploy:check | PASS | execução local 2026-11-27 |

## Preservação
- Não executado: reset browser-env, `--reset`, limpeza D1 local, apagar usuários/passkeys/recovery codes/sessões/dados do usuário, deploy, push, commit, PR, migração remota, escrita D1/R2 remoto, DNS/secrets/billing/recursos remotos.
- Servidor local 8788 não foi interrompido por esta entrega.
- Alterações preexistentes no worktree foram preservadas.

## Custo / segurança
- Custo recorrente: R$ 0. Sem serviços pagos/APIs pagas/billing/upgrade.
- Sem acesso direto do frontend ao D1. Auth não desativada.
- Sem segredos/PII em logs/evidências.
