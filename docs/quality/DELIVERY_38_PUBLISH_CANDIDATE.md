# D38 — Publish Candidate Curado (D35 closure + D36 + D37)

**Status:** CANDIDATO VALIDADO EM AMBIENTE ISOLADO (não publicado)
**Base:** `9794b82911e3afd89199cf2aa08ad2b9aa8ae610` (`origin/main`)
**Candidato:** `/tmp/opencode/d38-candidate` (worktree detached, sem commit/push/deploy)
**Data:** 2026-11-27

## 1) Escopo e curadoria

- Candidato construído a partir de `9794b82` com dependências de fechamento D35 + D36 + D37 + infra compartilhada justificada.
- Curadoria por grafo de dependências a partir de `app.ts`, `routes.tsx`, `navigation.ts`, D36/D37 e infra de build/test; exclusões documentadas.
- Sem commit, amend, push, PR, deploy, ações remotas Cloudflare/DNS/secrets, sem cobrança recorrente.
- Worktree principal preservado; `git reset/clean/checkout destrutivo/force push` não usados.

## 2) Manifestos

- Inclusão: `docs/quality/DELIVERY_38_INCLUSION_MANIFEST.md` (174 itens).
- Exclusão: `docs/quality/DELIVERY_38_EXCLUSION_MANIFEST.md` (90 itens vs 264 do snapshot de integração).
- Baseline worktree: `/tmp/opencode/d38-baseline/worktree-status.txt` (263 linhas), HEAD `9794b82`.

## 3) Validações

| Validação | Resultado | Evidência |
|---|---|---|
| `npm run format:check` | PASS | Prettier limpo após ajuste em `apps/web/test/navigation.test.ts` |
| `npm run lint` | PASS | ESLint sem erros |
| `npm run typecheck` | PASS | workspaces TS limpos |
| `npm test` (domain/web/api) | PASS | domain 2/34; web 9/45; api 27/129 (EXIT 0) |
| `npm run test:integration` | PASS | 15 files, 55 tests, EXIT 0 (`/tmp/opencode/d38-int-test.log`) |
| E2E D36 isolated 8789 | PASS | `apps/web/e2e/daily-flow.spec.ts` - 1 passed, 1 skipped (chromium/firefox) |
| E2E D37 isolated 8789 | PASS | `apps/web/e2e/observations.spec.ts` - 1 passed, 1 skipped |
| `npm run build` | PASS | web build + PWA gerados; warning de chunk grande pré-existente |
| `npm run db:generate` | PASS | "No schema changes, nothing to migrate" |
| Migração 0013 zero/upgrade | PASS | `observations-migration.test.ts` passou (inclui upgrade 0012->0013 com dados/seeds); journal/snapshot consistentes |
| `npm run backup:drill` | PASS | `/tmp/opencode/personal-os-drill-yttRDh/drill-summary.json`, EXIT 0 |
| `npm run deploy:check` | NOT RUN (pré-condição) | Falhou por ausência de `apps/api/wrangler.production.toml` no ambiente candidato; sem deploy remoto |
| `npm audit --audit-level=high` | PASS (gate high/critical) | 8 moderate, 0 high/critical; exit 0 |

## 4) D36/D37 semântica preservada

- D37: `personal_observations` com tipos/proveniência/confidence/algorithm_version/evidência/correção por supersessão, auditoria em `db.batch()`, `/api/v1/observations`, UI `/observacoes`.
- Migração 0013: FK `area_id` preservada no SQL; workaround Drizzle sem `.references()` no schema; snapshot/journal consistentes; `db:generate` limpo.
- D36: fluxo diário/reflexão local e E2E isolado preservados; `daily-flow.spec.ts` com `BROWSER_ENV_DIR`.
- Backup allowlist inclui `personal_observations`.

## 5) Limitações

- Candidato inclui fechamento amplo de grafo D35 (módulos/features compartilhados) além do mínimo estrito D36/D37; justificado por compilação/runtime/E2E. Itens não relacionados ao escopo foram excluídos conforme manifesto.
- `deploy:check` não executável sem `wrangler.production.toml`; nenhum deploy realizado.
- E2E completo contra `https://localhost:8788` não executado (proibido). Apenas D36/D37 isolados em 8789.
- Testes API rodam em Vitest/miniflare; wrangler dev local 8789 usado para E2E isolado.
- `npm audit` reporta vulnerabilidades moderate pré-existentes (sem high/critical).

## 6) Preservação / Segurança / Custo

- Worktree principal intacto (baseline em `/tmp/opencode/d38-baseline/worktree-status.txt`).
- Nenhum reset/clean/checkout destrutivo/force push.
- Nenhum commit/push/deploy/ação remota Cloudflare/DNS/secrets.
- Ambiente manual 8788 não tocado; E2E apenas em 8789 isolado.
- Custo recorrente: R$ 0.
