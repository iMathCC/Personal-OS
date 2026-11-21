# Runbook — recuperação administrativa de acesso

- **Versão:** 1.0 (Entrega 3 da Tarefa 1.2)
- **Status:** implementado, aguardando revisão
- **Relacionados:** `SECURITY.md` §14, `API_CONTRACTS.md` §2, ADR-0003, ADR-0012

Este runbook descreve **como apoiar o usuário sem criar um bypass de autenticação**. O sistema é single-tenant e não tem papel administrativo na API: não existe endpoint, segredo ou procedure que permita a um operador entrar na conta ou redefinir passkeys/códigos.

## 1. Regra de ouro

A recuperação de acesso é feita **pelo fluxo normal**, com um código de recuperação guardado pelo usuário:

1. `POST /api/v1/auth/recovery/verify` com o código → `recoveryToken` (10 min, sem sessão).
2. `POST /api/v1/auth/recovery/register/options` e `/verify` com o token → nova passkey.
3. `POST /api/v1/auth/login/options` e `/verify` → nova sessão.

O operador pode orientar o usuário, verificar o estado do banco **somente leitura** e conter sessões. **Não pode** gerar código, token, passkey ou sessão, nem substituir hashes no banco. Se todos os códigos e passkeys foram perdidos, a conta é **irrecuperável por design** — não existe procedimento de "reset administrativo". Essa é a consequência aceita de não ter e-mail, senha ou suporte a outro fator.

`SETUP_TOKEN` serve apenas ao bootstrap (`users.setup_completed_at IS NULL`) e é desabilitado definitivamente após o setup. Ele **não** recupera uma conta existente e deve ser rotacionado/removido após o bootstrap.

## 2. Diagnóstico (somente leitura)

Antes de qualquer ação, preserve evidências: exporte `audit_log` e os logs do Worker do período. Use apenas o binding do ambiente correto; **nunca** o banco de produção em testes locais.

```sql
-- Estado da conta (sem expor hashes nem credenciais)
SELECT id, display_name, setup_completed_at, created_at FROM users;

-- Passkeys cadastradas (sem chave pública)
SELECT id, name, counter, created_at, last_used_at FROM passkeys WHERE user_id = ?;

-- Códigos disponíveis/usados (sem code_hash)
SELECT id, used_at, created_at FROM recovery_codes WHERE user_id = ? ORDER BY created_at;

-- Sessões ativas
SELECT id, created_at, last_seen_at, expires_at
FROM sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_seen_at DESC;

-- Linha do tempo de autenticação
SELECT id, entity_type, entity_id, action, actor_type, request_id, created_at
FROM audit_log WHERE actor_id = ? OR entity_id = ? ORDER BY created_at;
```

Um `429` prolongado pode indicar abuso: consulte `rate_limits` **sem revelar chaves** (as chaves contêm hashes de IP) e correlacione com `audit_log` por `request_id`.

## 3. Contenção

Preferência: o próprio usuário encerra as sessões em “Sair de todos os dispositivos” (`POST /api/v1/auth/logout-all`) ou revoga uma sessão específica (`DELETE /api/v1/auth/sessions/:id`). As duas operações exigem sessão válida e gravam auditoria no mesmo batch da mutação.

Se o usuário não conseguir entrar e houver suspeita de sessão comprometida, um operador **autorizado** pode, em exceção de contenção, revogar sessões por SQL direto:

```sql
UPDATE sessions
SET revoked_at = '2026-01-01T00:00:00.000Z'  -- usar UTC ISO-8601 com ms real
WHERE user_id = ? AND revoked_at IS NULL;
```

Antes de executar:

- [ ] Aprovação explícita do dono da conta e evidência exportada.
- [ ] `request_id` único gerado para a operação.
- [ ] Inserção manual correspondente em `audit_log` no mesmo `request_id`, com `actor_type = 'system'`, `actor_id` identificando o operador, `action = 'session_revoke'`, `entity_type = 'user'`, `entity_id = <user_id>`, `after_json = '{"reason":"admin_containment"}'`, e `ip_hash`/metadados redigidos conforme a política (nunca IP puro, tokens, códigos ou valores pessoais).
- [ ] Conferência posterior: `SELECT COUNT(*) FROM sessions WHERE user_id = ? AND revoked_at IS NULL;` → `0`.

A auditoria manual é exceção e deve ser revisada em seguida; não substitui o registro feito pela API.

## 4. Bloqueios que **não** devem ser contornados

| Situação | Ação correta | Ação proibida |
| --- | --- | --- |
| Todos os códigos usados | Explicar que a conta não pode mais ser recuperada; dependência de export/backup para dados | Gerar/inserir códigos novos |
| Passkey perdida, mas há códigos | Usar `recovery/verify` + `register/*` | Inserir passkey diretamente no banco |
| `recoveryToken` expirado ou já usado | Usar outro código válido | Ajustar `expires_at`/`consumed_at` |
| `429` por falhas de login | Aguardar a janela; investigar abuso | Limpar `rate_limits` para "liberar" o IP |
| Sessão suspeita | `logout-all` ou revogação autorizada com auditoria | Copiar/inserir `token_hash` para entrar como usuário |
| Challenge já consumida | Gerar nova `/options` | Reverter `consumed_at` |

## 5. Após o incidente

1. Confirmar que o usuário conseguiu entrar com a nova passkey e que as sessões antigas estão revogadas.
2. Rotacionar `SETUP_TOKEN`, `CSRF_SECRET` e `IP_HASH_SALT` se houver suspeita de exposição de segredos (a rotação de `CSRF_SECRET`/`IP_HASH_SALT` invalida tokens e hashes atuais; planejar com o usuário).
3. Registrar o ocorrido em `docs/incidents/` com `request_id`s, ações e evidências, sem segredos ou PII.
4. Revisar se o caso indica falha de produto (por exemplo, códigos exibidos apenas uma vez sem confirmação) e abrir tarefa de correção com teste de regressão.
