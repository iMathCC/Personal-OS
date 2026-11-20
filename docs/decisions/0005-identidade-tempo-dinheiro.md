# ADR-0005 — Identidade, tempo e dinheiro

- **Status:** Proposto (requer aprovação)
- **Data:** 2026-11-20
- **Relacionados:** DATA_MODEL

## Contexto

O sistema precisa de IDs estáveis para exportação/importação, agrupamentos diários corretos em fusos diferentes e cálculos financeiros determinísticos. SQLite/D1 não tem tipos nativos de data, UUID ou decimal.

## Decisão

### IDs

- `TEXT` com **UUIDv7** gerado na aplicação (`uuid` v7).
- Chaves naturais (`key`, `isbn13`) são `UNIQUE`, mas não substituem a PK.
- IDs são preservados em exportação/restauração.

### Tempo

- Instantes: `TEXT` UTC ISO-8601 com milissegundos.
- Dias: `TEXT` `YYYY-MM-DD` (`local_date`) calculado no fuso IANA do usuário.
- Fuso padrão `America/Sao_Paulo`; configurável em `users.timezone`.
- Semana começa na segunda-feira por padrão.
- Cálculos de “hoje” usam o fuso do usuário, nunca o do servidor.

### Dinheiro

- `INTEGER` em centavos. Proibido `REAL` para saldo.
- `currency` ISO-4217; BRL na v1.
- Transferências com `transfer_group_id` e duas pernas opostas.
- Arredondamento apenas na apresentação.

## Alternativas consideradas

| Alternativa | Motivo de não adotar |
| --- | --- |
| UUIDv4 | Não ordenável; pior localidade de índice |
| ULID | Bom, mas UUIDv7 é padrão e já tem lib mantida |
| AUTOINCREMENT | Colide em importação/merge e vaza volume |
| Timestamp inteiro (epoch) | Menos legível em export/SQL; ISO é interoperável |
| `REAL` para dinheiro | Erros de ponto flutuante inaceitáveis |
| Decimal em TEXT | Complexidade de parsing/ordenação; centavos inteiros bastam |

## Consequências

**Positivas:** exportação/importação fiel, índices eficientes, agrupamentos corretos, finanças exatas.

**Negativas/riscos:** UUIDv7 exige biblioteca/implementação correta; ISO em TEXT ocupa mais espaço que inteiro; `local_date` pode divergir se o fuso mudar (documentado e intencional).

## Critérios de revisão

- Necessidade de multi-moeda com câmbio.
- Necessidade de agrupamento por múltiplos fusos por registro.
