# ADR-0002 — Worker único servindo SPA e API

- **Status:** Proposto (requer aprovação)
- **Data:** 2026-11-20
- **Relacionados:** ADR-0001, ADR-0006

## Contexto

O briefing exige separação entre frontend, backend e persistência, e acesso por desktop/celular com custo zero. Cloudflare oferece Pages (frontend) e Workers (API) separadamente, ou um Worker com Static Assets.

## Decisão

Implantar **um único Worker** com:

- `assets` apontando para `apps/web/dist`;
- `/api/*` roteado para Hono (`run_worker_first` para `/api/*`);
- fallback SPA (`not_found_handling = "single-page-application"`).

A separação **lógica** é mantida por camadas, pacotes e contratos. Frontend e backend continuam independentes no código e podem ser separados fisicamente depois.

## Alternativas consideradas

| Alternativa | Prós | Contras |
| --- | --- | --- |
| Pages + Worker separado | Isolamento de deploy, escala independente | CORS, cookies cross-site, CSRF mais complexo, dois pipelines, dois domínios |
| Worker único | Same-origin, cookies `__Host-`, deploy atômico, assets gratuitos | Acoplamento de deploy (frontend e API juntos) |
| Servir SPA de outro host/CDN | Flexibilidade | CORS e gestão de cookies; sem ganho nesta escala |

## Consequências

**Positivas:** segurança mais simples (same-origin), menos latência, um pipeline, rollback atômico, assets ilimitados no free tier.

**Negativas/riscos:** um deploy afeta UI e API ao mesmo tempo; o Worker precisa respeitar o limite de 20.000 arquivos estáticos (free); requer disciplina para não misturar código de UI e API.

## Migração futura

Se houver necessidade comprovada, extrair `/api` para outro Worker e manter o domínio da API em subdomínio; exige revisão de cookies (SameSite=None + CSRF) ou proxy same-origin. A decisão de domínio (ADR-0011) deve ser tomada antes.

## Critérios de revisão

- Necessidade de deploys independentes ou escala separada.
- Mudança para Cloudflare Pages por requisito de plataforma.
