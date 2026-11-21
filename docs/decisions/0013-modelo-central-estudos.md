# ADR-0013 — Modelo central, Estudos e idempotência recuperável (Entrega 5)

- **Status:** Aceito para o escopo da Entrega 5 (decisão local); não aprova decisões estratégicas pendentes
- **Data:** 2026-11-21
- **Relacionados:** [ADR-0005](0005-identidade-tempo-dinheiro.md), [ADR-0008](0008-agregacoes-e-limites-d1.md), [ADR-0007](0007-auditoria-e-historico.md), `DATA_MODEL`, `API_CONTRACTS`, `ROADMAP`

## Contexto

A Entrega 5 pede o modelo de dados central e uma vertical slice funcional de Estudos com persistência real, auditoria atômica, idempotência recuperável e testes executados. O projeto roda em D1/Workers com `db.batch()` atômico, sem transações interativas, orçamento de ~10 ms de CPU e ≤ 8 queries por requisição.

As decisões estratégicas seguem **pendentes e não aprovadas**: ADR-0005 (identidade, tempo e dinheiro) e ADR-0008 (agregações materializadas) constam como **Proposto** no índice de ADRs; D-11 (indicadores do dashboard), D-13 (retenção de auditoria de 12 meses) e D-14 (`@tanstack/react-query`/`react-hook-form`) seguem sem aprovação no roadmap. Nada neste ADR deve ser lido como aprovação delas.

## Decisão (escopo local da Entrega 5)

1. **Fato escalar canônico.** `metric_observations` é a fonte da verdade para valores escalares. Correção nunca sobrescreve o valor: cria uma nova linha e marca a original com `superseded_by`. Um trigger impede alteração de valores e um segundo vínculo de correção.
2. **Relações tipadas.** `events` usa colunas explícitas (`area_id`, `goal_id`, `course_id`, `study_session_id`). É proibido o par polimórfico `from_type`/`from_id`, que não pode ser representado por FK no SQLite.
3. **Objetivos.** `goals` + `goal_metrics` representam objetivos e suas métricas vinculadas, com `direction`, `weight` e `baseline_value`.
4. **Proveniência derivada.** `study_minutes` é derivado deterministicamente da duração da sessão. A observação usa `src_calculation` e `algorithm_version = 'study-minutes-v1'`; **não** usa `src_manual`. A sessão e o evento são registros manuais.
5. **Tempo por registro.** `local_date` **e** `timezone` IANA são capturados em cada registro de fato. Isto ajusta o `DATA_MODEL.md` §1.4, que previa "`timezone` nunca é armazenado por registro na v1"; o registro explícito preserva o fuso vigente no momento do fato. Se o fuso da conta mudar, `local_date` histórico não é reescrito.
6. **Chave idempotente canônica.** `v1|subject|method|path|clientKey`, com codificação injetiva das partes. A query entra apenas no hash da requisição, nunca na identidade da chave. O subject é o usuário autenticado.
7. **Recuperação.** `idempotency_key_reservations` guarda a identidade permanente da chave e é gravada **antes** da mutação. `operation_results` é append-only e devolve byte a byte o envelope original; a limpeza comum pode remover somente `idempotency_keys`. O `claim` na tabela operacional é o guard de concorrência: duas requisições concorrentes geram uma única mutação e o perdedor recupera o resultado original.
8. **Auditoria.** Mutação + `audit_log` + resultado entram no mesmo `db.batch()`. Snapshots contêm chaves nullable explicitamente (`null` ≠ ausente) e excluem texto livre (notas, motivos, descrições). `audit_log` permanece append-only.
9. **Limites.** Corpo original 16.384 bytes; resultado gravado 32.768 bytes; espelho operacional 8.192 bytes; envelope 65.536 bytes. Exceder o resultado aborta **antes** da mutação; exceder apenas o espelho grava `bodyOmitted`.
10. **Séries sob demanda.** Séries e dashboard calculam a partir de observações ativas com limites explícitos (≤ 10.000 observações por consulta, ≤ 200 pontos por dia, ≤ 8 queries). Não há `metric_daily`, `aggregation_queue`, Cron Trigger, filas nem novas dependências nesta entrega.
11. **Transições de estado.** A substituição de uma observação é inserida antes de atualizar `superseded_by`, porque a FK é imediata. Triggers abortam uma segunda correção ou exclusão lógica concorrente; o `batch` desfaz qualquer linha órfã.
12. **Fora desta decisão.** Não implementar a retenção de 12 meses de auditoria (D-13 continua pendente). Não aprovar D-11: o dashboard passa a mostrar um indicador real de estudos sem definir o conjunto definitivo de 6–8 indicadores. Não adotar as bibliotecas de D-14.

## Alternativas consideradas

| Alternativa | Motivo da não adoção nesta entrega |
| --- | --- |
| `from_type`/`from_id` polimórfico em `events` | Impede FK e integridade referencial no SQLite |
| Agregados `metric_daily` + cron (ADR-0008) | ADR não aprovado; volumes atuais cabem em leitura limitada sob demanda |
| Reconstruir resposta no replay a partir das entidades | Entidades mudam; a promessa é devolver o resultado original |
| `timezone` apenas em `users` | Perde o fuso vigente no momento do fato; contraponto registrado no item 5 |
| `src_manual` para minutos derivados | Viola a regra de proveniência para cálculo determinístico |
| Chave idempotente com query na identidade | Query varia por ordenação/filtro e quebraria a recuperação |

## Consequências

**Positivas:** fatos imutáveis e rastreáveis; correção preserva histórico; replay sobrevive à limpeza operacional; concorrência não duplica mutação; nenhum custo ou serviço novo; vertical slice executável de ponta a ponta.

**Negativas/riscos:** leitura sob demanda de observações cresce com o volume — requer monitoramento do limite de 10.000 linhas e decisão futura sobre agregação (ADR-0008); reservas e resultados são append-only e precisarão de política de retenção própria; `timezone` por registro aumenta o armazenamento e diverge do texto original do DATA_MODEL, agora ajustado.

## Critérios de revisão

- Aprovação humana de ADR-0005/ADR-0008 ou das decisões D-11/D-13/D-14.
- Consultas de série atingindo o limite de 10.000 observações ou extrapolando 8 queries.
- Necessidade de retenção para reservas/resultados ou de purge de auditoria.
- Mudança de fuso do usuário com impacto em relatórios históricos.
