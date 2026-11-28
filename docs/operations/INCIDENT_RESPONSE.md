# Resposta a Incidentes

## Princípios
- Preservar dados antes de ações corretivas destrutivas.
- Não expor segredos, PII, tokens ou conteúdo sensível em logs compartilhados.
- Toda operação remota exige autorização explícita.

## Classificação

| Tipo | Sinais | Ação imediata |
|---|---|---|
| Indisponibilidade API | 5xx, health 503, timeout | Verificar `/api/v1/health`, logs Wrangler/observability, D1 status; não redeploy às cegas |
| Falha de autenticação | 401/403 em massa, falha passkey | Checar `RP_ID/ORIGIN`, secrets presentes, cookies/CSRF, relógio, mudanças recentes |
| Falha de persistência/D1 | erros `DEPENDENCY_UNAVAILABLE`, D1_ERROR | Confirmar binding DB, migrations, limites D1; pausar mutações críticas se necessário |
| Limite Cloudflare Free | 1027/1102/limite D1 | Ativar degradação segura; comunicar limite; não habilitar billing |
| Suspeita de segurança | auth anômala, CSRF/origin falhas, secret vazado | Rotacionar secrets afetados com autorização, revogar sessões, auditar logs, preservar evidências |

## Diagnóstico mínimo
1. Capturar `requestId`, status, path sem query, timestamp.
2. Consultar `/api/v1/health` (sem dados sensíveis).
3. Verificar versão publicada e último deploy autorizado.
4. Verificar migrations aplicadas vs esperadas.
5. Verificar limites/erros no dashboard Cloudflare (somente com acesso autorizado).

## Mitigação segura
- **Nunca** confirmar persistência não ocorrida.
- Em erro de escrita, retornar erro claro e preservar idempotência.
- Em limite atingido, falhar de forma segura e informativa.
- Desativar funcionalidade opcional antes de comprometer núcleo.

## Rollback
- Usar versão anterior conhecida se deploy recente causou regressão.
- Não reverter migrations destrutivamente sem backup e plano.
- Documentar horário, versão, impacto, decisão e evidência.

## Comunicação
- Registrar incidente, impacto, usuários afetados (sem PII), causa provável, mitigação, status.
- Não declarar "resolvido em produção" sem verificação pós-mitigação.
