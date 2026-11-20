# ADR-0001 — Stack inicial e monorepo

- **Status:** Aceito com ajustes (stack fornecida no briefing; ajustes propostos)
- **Data:** 2026-11-20
- **Relacionados:** ADR-0002, ADR-0008

## Contexto

O briefing define React + Vite + TypeScript, Tailwind + shadcn/ui, ECharts, Hono, Cloudflare Workers/D1, Drizzle, Zod, vite-plugin-pwa, GitHub privado e R2 opcional. A stack precisa operar no plano gratuito e ser portátil.

## Decisão

Adotar a stack proposta, com estes ajustes e fixações:

- **Node 22 LTS** (Vite 7+ exige ≥ 20.19/22.12; o ambiente atual tem 18.19.1).
- **npm workspaces** para o monorepo (npm já disponível; evita nova ferramenta).
- **Zod ≥ 4.5.0** (versões antigas usam memória excessiva no Workers, conforme documentação oficial).
- **Tailwind CSS v4** + shadcn/ui (componentes copiados, não dependência de runtime).
- **ECharts** com imports seletivos e carregamento lazy.
- **Drizzle** com driver `d1`; migrações via `drizzle-kit` + `wrangler d1 migrations apply`.
- **Vitest** + `@cloudflare/vitest-pool-workers` para testes; Playwright para E2E.
- Estrutura: `apps/web`, `apps/api`, `packages/shared`, `packages/domain`, `packages/db`.

Dependências adicionais propostas (justificadas no ARCHITECTURE §14): `uuid` (v7), `@simplewebauthn/*`, `react-router`, `@tanstack/react-query`, `react-hook-form`, ESLint/Prettier.

## Alternativas consideradas

| Alternativa | Motivo de não adotar |
| --- | --- |
| pnpm workspaces | Mais eficiente, mas adiciona ferramenta; npm atende 5 pacotes |
| Biome no lugar de ESLint/Prettier | Mais simples/rápido, porém ecossistema e regras TypeScript menos maduros para o time |
| Tailwind v3 | v4 é o padrão atual e compatível com shadcn |
| `echarts-for-react` | Dependência extra; wrapper próprio é trivial |
| Jest | Vitest integra melhor com Vite/TS e Workers |

## Consequências

**Positivas:** stack madura, gratuita, tipada de ponta a ponta; testes no runtime real; portabilidade razoável.

**Negativas/riscos:** Node 22 obrigatório; ECharts aumenta bundle se mal importado; Drizzle no D1 não tem transações interativas; shadcn exige manutenção dos componentes copiados.

## Critérios de revisão

- Se o bundle inicial passar de 250 KB gzip de forma persistente.
- Se o Node 22 não estiver disponível no ambiente de desenvolvimento/CI.
- Se uma dependência adicional relevante for necessária.
