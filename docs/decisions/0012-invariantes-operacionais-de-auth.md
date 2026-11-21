# ADR-0012 — Invariantes operacionais de autenticação e auditoria

- **Status:** Aceito com ajustes (Tarefa 1.2, Entregas 2 e 3)
- **Data:** 2026-11-20
- **Relacionados:** ADR-0003, ADR-0006, ADR-0007, SECURITY.md, DATA_MODEL

## Contexto

A revisão do planejamento da Tarefa 1.2 exigiu correções que não cabiam mudanças silenciosas: escrita atômica no D1, limite de sessões sob concorrência, identificador complementar de dispositivo, runbook administrativo e exibição de códigos de recuperação. Parte delas é infraestrutural e afeta contratos, segurança e portabilidade.

## Decisão

1. **Atomicidade real no D1.** Toda mutação de domínio e sua linha de `audit_log` entram no mesmo `db.batch()`. Para updates condicionais, usar `UPDATE ... WHERE id=? AND version=?` seguido de `INSERT ... SELECT ... WHERE changes()=1`. `db.batch()` é atômico, mas **não para** depois de uma statement que afeta zero linhas — isso é tratado explicitamente em teste de integração.

2. **Limite de 10 sessões ativas com estado final no banco.** O serviço revoga a sessão menos recentemente usada (LRU) e registra a auditoria no mesmo batch. Como rede de segurança, o trigger `sessions_active_limit` aborta uma 11ª inserção ativa. D1 é serial por banco, então inserções concorrentes não escapam do limite. O trigger **não** revoga silenciosamente: a revogação auditada continua sendo responsabilidade da aplicação.

3. **`pos_vid` é complementar, não primário.** Um identificador de dispositivo pode ser armazenado apenas como dado auxiliar de sessão/rate limit; nunca é prova de identidade nem substitui passkey, sessão ou código de recuperação. A fonte de IP só é confiável se vier do cabeçalho injetado pela Cloudflare em uma requisição que passou pelo Worker; `X-Forwarded-For` fornecido pelo cliente não é aceito. IP e user agent são persistidos somente como hashes com salt por instalação. `audit_log.ip_hash` exige 64 caracteres (SHA-256).

4. **Códigos de recuperação exibidos uma vez.** A API devolve os 10 códigos em uma única resposta, protegida por sessão recém-autenticada. A interface exige confirmação explícita do usuário (“guardei os códigos”) antes de descartar a exibição. Os códigos **nunca** são gravados em `localStorage`, `sessionStorage`, cache do PWA, logs ou audits; no banco existem apenas hashes SHA-256 (`recovery_codes.code_hash`).

5. **Runbook administrativo com rastreabilidade.** Toda ação administrativa em produção (revogação em massa, reindexação, purge, restauração) exige: aprovação explícita, `actor`, `request_id`, antes/depois em JSON com valores sensíveis removidos e registro em `audit_log`. Operações destrutivas só após exportação verificada. Dados sensíveis e credenciais ficam fora do repositório. Comandos diretos no D1 são exceção de emergência e devem ser acompanhados de entrada manual de auditoria; a via preferencial é um endpoint autenticado na Fase 1.

6. **`recovery_tokens` e desafios com propósito.** Token temporário de recuperação é persistido como hash, vinculado a `user_id` e `purpose`, com expiração e uso único. `auth_challenges` passa a aceitar `user_id` e `purpose` (`setup`, `login`, `recovery_register_passkey`) para suportar o fluxo sem reutilizar desafio entre propósitos.

## Alternativas consideradas

| Alternativa | Motivo de não adotar |
| --- | --- |
| Confiar apenas no serviço para o limite de sessões | Uma falha de código poderia deixar 11 sessões ativas; o banco é a última linha de defesa |
| Trigger que revoga automaticamente a sessão antiga | Revogação sem `actor`/`request_id` fura a auditoria exigida pela ADR-0007 |
| Armazenar IP puro para “rastrear dispositivo” | Dado pessoal desnecessário; risco em logs e exportações |
| Guardar códigos de recuperação no navegador | Qualquer XSS ou acesso ao dispositivo transformaria recuperação em roubo de conta |
| `INSERT OR REPLACE` em `audit_log` | Sobrescreve histórico; bloqueado por trigger adicional (`0002`) |

## Consequências

**Positivas:** invariantes verificáveis no banco, recuperação auditável, menos PII em repouso, runbook executável sem segredos no repositório.

**Negativas/riscos:** triggers e hashes adicionam poucas linhas de SQL e exigem testes de upgrade; a revogação LRU precisa ser implementada no serviço sem duplicar regras; exibição única dos códigos depende de UX cuidadosa na Entrega 3.

**Estado de implementação:** a fundação de persistência (tabelas, constraints, triggers, seeds e testes) foi entregue na Entrega 2. Na Entrega 3, setup/login/recuperação, middleware, UI e runbook operacional (`docs/operations/admin-recovery.md`) foram implementados. Ajustes observados na implementação, sem mudar a decisão aprovada:

- O guard de uso único usa `INSERT` de sentinela em `idempotency_keys` (`guard:session-limit:*` para o limite de sessões) dentro do mesmo `db.batch()`; a violação de `UNIQUE` é traduzida para `409 CONFLICT` pelo `atomicBatch()`.
- A tabela `rate_limits` não tem coluna própria de falhas: contadores de falha usam a chave `failure:<key>` na mesma tabela.
- Os valores numéricos de rate limit não estavam neste ADR; a tabela vigente é a da Entrega 3, reproduzida em `SECURITY.md` §2.5 e `API_CONTRACTS.md` §2.6.
- E2E entregue em nível de Worker (autenticador virtual + D1 real), sem Playwright; a validação em browser real segue como gate de lançamento.

## Critérios de revisão

- `db.batch()` passar a garantir parada em zero linhas (mudança de runtime) — revalidar o padrão `changes()=1`.
- Necessidade de múltiplos propósitos de token além de `recovery_register_passkey`.
- `pos_vid` precisar ser usado como fator de decisão de segurança (exigiria novo ADR).
