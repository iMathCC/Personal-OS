# ADR-0006 — Contratos REST versionados

- **Status:** Proposto (requer aprovação)
- **Data:** 2026-11-20
- **Relacionados:** API_CONTRACTS, ADR-0002

## Contexto

O frontend e o backend evoluem juntos, mas exportações, scripts e uma futura migração de cliente exigem contratos estáveis. GraphQL/tRPC adicionariam ferramentas e acoplamento; REST + Zod é simples e testável.

## Decisão

- REST JSON em `/api/v1`.
- Envelope `{ data, meta }` para sucesso e `{ error: { code, message, details, requestId } }` para erro.
- Paginação por cursor, `limit` ≤ 200.
- `Idempotency-Key` em criação; `ETag`/`If-Match` para concorrência otimista.
- Schemas Zod em `packages/shared` como fonte de verdade; DTOs `camelCase`.
- Códigos de erro estáveis; HTTP status coerentes.
- Mudanças incompatíveis → `/v2`; adições compatíveis não mudam versão.

## Alternativas consideradas

| Alternativa | Prós | Contras |
| --- | --- | --- |
| tRPC | Tipagem automática, menos boilerplate | Acopla cliente/servidor a TS; ruim para exportação/scripts; versionamento mais difícil |
| GraphQL | Flexibilidade de consulta | Complexidade de schema/resolvers/N+1; overkill para single-user |
| REST + Zod | Simples, cacheável, testável, portátil | Boilerplate de DTOs; disciplina manual de versionamento |

## Consequências

**Positivas:** interface clara, fácil de testar com `app.request()`, cacheável, portátil, boa para integrações futuras.

**Negativas/riscos:** duplicação potencial entre schema de banco e DTO (mitigada por mapeadores explícitos); disciplina para não quebrar contratos.

## Critérios de revisão

- Necessidade de consultas agregadas muito complexas que gerem múltiplas idas ao servidor.
- Necessidade de clientes externos com requisitos específicos.
