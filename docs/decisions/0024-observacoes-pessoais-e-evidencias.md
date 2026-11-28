# ADR-0024 — Observações pessoais, fatos, inferências e evidências

- **Status:** Aceito
- **Data:** 2026-11-27
- **Relacionados:** ADR-0001, ADR-0002, ADR-0003, ADR-0005, ADR-0013, ADR-0023

## Contexto

O Personal OS já possuía observações de domínio específicas (`metric_observations` para estudos/métricas e `health_observations` na camada de vida), além de registros de atividades (tarefas, sessões de estudo, treinamento, leitura, tempo). Faltava uma captura transversal para fatos pessoais reais que não se encaixam apenas nesses domínios, com distinção explícita entre intenção, planejamento, execução, resultado observado, resultado confirmado e inferência.

Restrições: R$ 0, Cloudflare Free, sem serviços pagos, sem dados fictícios, sem transformar inferência em fato, sem causalidade sem evidência, sem duplicar contratos existentes.

## Decisão

1. **Novo modelo transversal `personal_observations`** (D1/Drizzle) para observações pessoais registradas pelo usuário. Não substitui `metric_observations` nem tabelas de domínio específicas.
2. **Semântica explícita por `kind`:** `intention`, `planning`, `executed`, `observed_result`, `confirmed_result`, `inference`. `inference` exige `confidence` (0..1).
3. **Proveniência e histórico:** `source_id` (default `src_manual`), `confidence`, `algorithm_version`, `evidence_json` (referências), `status`, `superseded_by`, `corrects_id`, `version`, operation IDs, audit log atômico via `db.batch()`.
4. **Correção sem sobrescrita silenciosa:** correção cria nova observação ativa com `corrects_id` e marca a anterior como `superseded`, com auditoria before/after.
5. **Integração por referências opcionais:** `area_id`, `related_task_id`, `related_project_id`, `related_goal_id`, `related_study_session_id`, `related_course_id`. Sessões de estudo existentes continuam sendo a fonte de tempo de estudo; observações pessoais podem referenciá-las, sem duplicar a sessão.
6. **Indicadores com cobertura explícita:** endpoint `/api/v1/observations/summary` calcula contagens por área/tipo e cobertura de dias. Dias sem observação não são preenchidos com zero. Limitações são retornadas no payload.
7. **UI simples e reutilizável:** página `/observacoes`, fora de `/hoje`, com captura rápida, histórico, correção, proveniência e indicadores.

## Alternativas consideradas

| Alternativa | Prós | Contras | Motivo do descarte |
|---|---|---|---|
| Reusar apenas `metric_observations` | Reuso máximo | Modelo métrico-numérico, acoplado a métricas/sessões; semântica de intenção/resultado/inferência ficaria implícita | Não expressa o domínio D37 com clareza |
| Criar observação por domínio (health/training/etc.) | Alinhado a domínios | Duplica captura transversal e não cobre fatos pessoais gerais | D37 exige captura reutilizável cross-domain |
| Inferir observações automaticamente de tarefas/eventos | Menos atrito | Viola regra de não transformar intenção/execução em fato/resultado | Proibido pelo D37 |

## Consequências

**Positivas:** captura pessoal auditável; distinção fato/inferência; base para indicadores com cobertura; integração por referências sem duplicar domínios existentes.

**Negativas/riscos:** novo modelo aumenta superfície de API/schema; indicadores iniciais são simples (contagem/cobertura), não longitudinal avançado; referências cruzadas são opcionais e dependem de uso disciplinado.

## Critérios de revisão

- Se observações pessoais precisarem sincronização/remoto além do D1 local/Cloudflare Free.
- Se houver necessidade de anexos binários/evidências grandes (avaliar R2 e custos).
- Se indicadores exigirem motor analítico mais pesado que o orçamento de CPU do Worker.
