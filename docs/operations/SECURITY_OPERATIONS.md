# Operações de Segurança

## Controles existentes (verificar antes de produção)
- **Auth**: Passkeys WebAuthn, RP_ID/ORIGIN rígidos, sessões HttpOnly/Secure/SameSite, CSRF por token, recovery codes one-time.
- **API**: validação Zod, IDs request, rate limit, no-store em `/api/v1/*`, CSP `default-src 'none'` para API, HSTS.
- **Dados**: D1 com FKs/constraints, auditoria, versionamento where applicable, allowlist backup.
- **Segredos**: apenas Worker secrets; `deploy:check` bloqueia segredos em vars/placeholders.

## Rotina operacional
- Rotacionar `SETUP_TOKEN` após bootstrap.
- Rotacionar `CSRF_SECRET`/`IP_HASH_SALT` somente com plano de impacto (invalida sessões/tokens conforme implementação).
- Revisar `npm audit --audit-level=high` antes de release; classificar moderates.
- Revisar headers de segurança em HTML/assets/API após deploy.
- Confirmar que logs não contêm cookies, tokens, notas, valores financeiros, dados de saúde.

## Resposta a evento de segredo
1. Considerar segredo comprometido.
2. Planejar rotação com autorização explícita.
3. Revogar sessões se necessário.
4. Registrar evidência sem expor valor.
5. Validar login/CSRF/rate limit após rotação.

## Checklist pré-produção
- [ ] `RP_ID`/`ORIGIN` definitivos antes do primeiro cadastro passkey.
- [ ] 3 secrets configurados no Worker remoto.
- [ ] `workers_dev`/`preview_urls` conforme política.
- [ ] `deploy:check` e dry-run verdes.
- [ ] Backup exportado antes de migrations/deploy arriscado.
- [ ] Plano Free confirmado; sem billing.

## Limitações
- Não há WAF pago/sistema SIEM externo; usar observabilidade Cloudflare Free.
- Rate limit é best-effort dentro de limites Free; não substitui controles de origem/auth.
