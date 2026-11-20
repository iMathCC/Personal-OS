# ADR-0003 — Autenticação por passkeys

- **Status:** Proposto (requer aprovação — decisão D-01)
- **Data:** 2026-11-20
- **Relacionados:** ADR-0011, SECURITY.md

## Contexto

O app é exposto na internet e guarda dados financeiros e de saúde. O plano gratuito do Workers impõe **10 ms de CPU por requisição**. Autenticação com senha exige KDF caro (Argon2/PBKDF2 com iterações seguras), que pode estourar esse limite. Cloudflare Access é uma alternativa, mas exige domínio próprio em zona Cloudflare (não funciona em `workers.dev`).

## Decisão

Usar **passkeys (WebAuthn)** como método primário, com:

- cadastro de múltiplas passkeys;
- 10 códigos de recuperação de uso único (armazenados como SHA-256);
- sessões opacas de 256 bits em cookie `__Host-pos_session` (HttpOnly/Secure/SameSite=Lax), hash SHA-256 no banco;
- CSRF por double-submit + validação de `Origin`;
- rate limit em endpoints de auth;
- bootstrap com `SETUP_TOKEN` e endpoint desabilitado após o primeiro acesso.

Biblioteca: `@simplewebauthn/server` (suporta Workers) + `@simplewebauthn/browser`. Validar CPU com benchmark na Fase 1.

## Alternativas consideradas

| Alternativa | Prós | Contras |
| --- | --- | --- |
| Passkeys | Anti-phishing, sem KDF caro, boa UX, padrão aberto | Dependência de suporte do dispositivo; RP ID dificulta troca de domínio; curva de implementação |
| Cloudflare Access | Auth gerenciada, MFA, sem código | Exige domínio próprio; dependência do provedor; difícil testar localmente; não é "dados sob controle" |
| Senha + PBKDF2/Argon2 | Universal | CPU pode exceder 10 ms; risco de força bruta; pior UX |
| Magic link por e-mail | Simples | Exige provedor de e-mail (custo/dependência); entrega não garantida; sem MFA |
| TOTP + senha | Familiar | Ainda exige senha; pior UX |

## Consequências

**Positivas:** segurança superior, sem senhas para vazar, custo de CPU baixo, experiência moderna em desktop/celular.

**Negativas/riscos:** perda de todos os dispositivos exige código de recuperação; trocar o domínio (RP ID) invalida passkeys; suporte de autenticadores varia; recuperação precisa ser testada rigorosamente.

## Critérios de revisão

- Benchmark de CPU > 8 ms de forma consistente.
- Impossibilidade de usar passkeys em dispositivos necessários.
- Decisão de adotar Cloudflare Access (exigiria domínio próprio).
