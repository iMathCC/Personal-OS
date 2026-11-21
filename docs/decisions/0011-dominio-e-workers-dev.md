# ADR-0011 — Domínio e `workers.dev`

- **Status:** Aceito
- **Data:** 2026-11-20
- **Relacionados:** ADR-0003, ARCHITECTURE §18

## Contexto

O orçamento é R$ 0. Um domínio próprio custa aproximadamente US$ 10/ano. O app pode rodar em `personal-os.<account>.workers.dev` gratuitamente. Porém:

- **Passkeys são vinculadas ao RP ID** (domínio). Trocar de `workers.dev` para domínio próprio exige **re-registrar** todas as passkeys.
- **Cloudflare Access** só funciona com domínio em zona Cloudflare, não em `workers.dev`.
- Cookies `__Host-` funcionam em ambos.
- PWA instalável funciona em ambos (HTTPS).

## Decisão proposta

Começar em `*.workers.dev` (R$ 0) e **decidir o domínio definitivo antes do cadastro da primeira passkey**. Se houver intenção de usar domínio próprio ou Cloudflare Access, adotar o domínio desde a Fase 1.

## Alternativas

| Alternativa | Custo | Passkeys | Access | Observações |
| --- | --- | --- | --- | --- |
| `workers.dev` | R$ 0 | Funciona; RP ID imutável | Não | Simples; sem marca própria |
| Domínio próprio | ~US$ 10/ano | Funciona; RP ID estável | Sim | Requer aprovação de custo |
| Subdomínio gratuito de terceiro | R$ 0 | Depende do controle do domínio | Não | Frágil; não recomendado |
| Cloudflare Access + domínio | ~US$ 10/ano | Access gerencia | Sim | Auth mais simples, menos controle local |

## Atualização 21/11/2026 — RP ID em `workers.dev`

`workers.dev` consta na Public Suffix List. Portanto, o domínio registrável é o hostname completo de três rótulos: o RP ID deve ser `personal-os.<subdominio>.workers.dev`, e não `<subdominio>.workers.dev`. `ORIGIN` precisa ser exatamente `https://personal-os.<subdominio>.workers.dev`. A validação de WebAuthn permanece rigorosa; não há flexibilização para deploy. O hostname definitivo deve ser escolhido antes do primeiro cadastro de passkey. Procedimento em [free-deployment.md](../operations/free-deployment.md).

## Consequências

**Positivas (workers.dev):** zero custo, setup imediato, HTTPS/PWA.

**Negativas/riscos:** sem marca; migração de passkeys se o domínio mudar; Access indisponível; alguns ambientes corporativos bloqueiam `workers.dev`.

## Critérios de revisão

- Usuário decide adotar domínio próprio.
- Necessidade de Cloudflare Access.
- Bloqueio de `workers.dev` em redes usadas.
