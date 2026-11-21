# ADR-0007 — Auditoria append-only sem event sourcing

- **Status:** Aceito com ajustes (Tarefa 1.2, Entrega 2)
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

## Ajustes aprovados na Tarefa 1.2 (Entrega 2)

- `audit_log` passa a ser **append-only também no banco**: migrações `0001_audit_append_only.sql` e `0002_audit_no_replace.sql` bloqueiam `UPDATE`, `DELETE` e `INSERT OR REPLACE`. O serviço continua responsável por `actor`, `request_id` e `before/after` — triggers não substituem essa responsabilidade.
- Metadados de auditoria seguem allowlist: sem tokens, credenciais, IP puro ou valores sensíveis; `ip_hash` exige SHA-256 com salt (64 caracteres).
- O padrão `UPDATE ... WHERE version=?` + `INSERT ... SELECT ... WHERE changes()=1` no mesmo `db.batch()` foi validado em teste de integração, incluindo a demonstração de que o batch continua após uma escrita com zero linhas.

**Estado de implementação (Entrega 3):** todas as mutações de auth (setup, login, logout, revogações, recuperação, consumo de challenge/código/token e anomalia de contador) gravam auditoria no mesmo batch. Testes de concorrência confirmam auditoria única por sessão criada e nenhuma auditoria órfã; logs estruturados de erro não incluem stack trace, SQL ou dados do usuário. Runbook de operações administrativas em `docs/operations/admin-recovery.md`.

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
