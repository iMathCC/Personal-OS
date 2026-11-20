# ADR-0007 — Auditoria append-only sem event sourcing

- **Status:** Proposto (requer aprovação)
- **Data:** 2026-11-20
- **Relacionados:** DATA_MODEL, PRODUCT_SPEC

## Contexto

O briefing exige “histórico de eventos preservado” e registro de acontecimentos. Event sourcing completo resolveria isso, mas impõe reconstrução de estado, versionamento de eventos, projeções e complexidade operacional desproporcional a um sistema pessoal.

## Decisão

Separar três conceitos:

1. **`events`** — acontecimentos de vida registrados pelo usuário (diário), editáveis com auditoria.
2. **`audit_log`** — log técnico append-only de mutações (create/update/delete/login/export/import/purge), com antes/depois, ator e request ID.
3. **Observações imutáveis** — fatos como `metric_observations` e `transactions` não são sobrescritos; correções usam novo registro + `superseded_by`.

Mutação + auditoria são gravadas no mesmo `db.batch()`.

Não haverá event sourcing, replay de agregados ou barramento de eventos na v1.

## Alternativas consideradas

| Alternativa | Prós | Contras |
| --- | --- | --- |
| Audit log + soft delete | Simples, suficiente, barato | Não reconstrói estado arbitrário; requer disciplina |
| Event sourcing completo | Histórico total, replay | Complexidade alta; migrações/eventos versionados; overkill |
| Só soft delete | Simples | Não registra quem/quando/o que mudou |
| Triggers SQL para auditoria | Automático | Difícil capturar ator/request ID; duplicação e custo de escrita |

## Consequências

**Positivas:** simplicidade, consultas diretas, histórico útil, menos bugs, custo baixo.

**Negativas/riscos:** auditoria depende da camada de serviço (bypass SQL direto não é auditado); `before/after` pode conter PII (acesso restrito, retenção 12 meses); não há “viajar no tempo” para qualquer estado.

## Critérios de revisão

- Necessidade comprovada de replay/reconstrução histórica.
- Auditoria regulatória.
