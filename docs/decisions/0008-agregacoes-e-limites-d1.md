# ADR-0008 — Agregações materializadas e limites do D1

- **Status:** Proposto (requer aprovação)
- **Data:** 2026-11-20
- **Relacionados:** ADR-0001, ARCHITECTURE §7, DATA_MODEL

## Contexto

D1 Free permite 5 milhões de linhas lidas/dia, 100 mil escritas/dia e 500 MB por banco, com no máximo 50 queries por invocação. Dashboards que varrem anos de observações consumiriam cota, CPU e tempo. O Workers Free limita 10 ms de CPU por requisição.

## Decisão

- Observações/fatos brutos são a fonte da verdade.
- `metric_daily` armazena agregados por métrica/dia, reconstruíveis, com `algorithm_version`.
- Escritas marcam dias sujos em `aggregation_queue`; cron noturno recalcula dias sujos + últimos 7 dias.
- Recalculo completo sob demanda para backfill.
- Dashboards leem agregados e resumos, nunca varreduras de anos.
- Toda consulta tem índice; toda FK tem índice; paginação por cursor.
- Orçamento: ≤ 8 queries por requisição.

## Alternativas consideradas

| Alternativa | Prós | Contras |
| --- | --- | --- |
| Cálculo em tempo real | Sem cache, sempre atual | Cota/CPU imprevisíveis; dashboards lentos |
| Views SQL | Simples | Ainda varrem dados; sem ganho de cota |
| Cache em KV | Leitura barata | KV free: 1.000 escritas/dia; invalidação complexa; consistência |
| Agregados materializados em D1 | Barato, determinístico, transacional | Precisa de invalidação/cron; duplicação derivada |
| Banco analítico externo | Poderoso | Custo/dependência; viola R$ 0 |

## Consequências

**Positivas:** dashboards rápidos, cota previsível, CPU baixa, resultados reproduzíveis.

**Negativas/riscos:** dados podem ficar até 24 h desatualizados em dashboards (mitigado por recálculo imediato de dias recentes na escrita, se barato); complexidade de invalidação; risco de divergência se o cron falhar (monitorar `job_runs` e expor “atualizado em”).

## Critérios de revisão

- Necessidade de análise em tempo real.
- Estouro recorrente de cota mesmo com agregados.
- Migração para Workers Paid/Postgres.
