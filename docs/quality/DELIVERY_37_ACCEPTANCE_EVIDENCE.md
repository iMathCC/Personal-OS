# Delivery 37 — Acceptance Evidence

## Resumo
- Data: 2026-11-27
- Branch/worktree: dirty, com alterações preexistentes preservadas; D35 commitado/publicado (`9794b82`), D36/D37 locais não commitados.
- Baseline git: não regenerado nesta etapa; worktree preservado sem reset/clean/checkout destrutivo.
- Escopo: captura de observações pessoais e evidências (D37), reutilizando contratos existentes onde adequado, sem deploy/remote, sem writes remotos.

## Reuso / decisões de modelo
- Reutilizado: `metric_observations` (séries/métricas), DTOs/serviço de estudos, `health_observations`/proveniência de vida, consumidores decision/life, padrões de idempotência/auditoria/`db.batch()`.
- Novo subsistema transversal: `personal_observations` (migração `0013_overrated_nebula.sql`) para fatos/intenção/resultado/inferência pessoais com referência opcional a área/tarefa/projeto/objetivo/sessão de estudo/curso. Não substitui tabelas de domínio existentes.
- Semântica explícita: `kind` em `intention|planning|executed|observed_result|confirmed_result|inference`; inferência exige `confidence`; correção cria nova observação ativa e marca anterior `superseded` com `correctsId/supersededBy`; sem sobrescrita silenciosa; dias sem observação não viram zero fictício no resumo.

## Implementação
- Contratos: `packages/shared/src/observations.ts`, export em `packages/shared/src/index.ts`.
- Domínio: `packages/domain/src/observations.ts`, export em `packages/domain/src/index.ts`.
- Schema/repo: `packages/db/src/schema/personal-observations.ts`, `packages/db/src/schema/index.ts`, `packages/db/src/repositories/observations.ts`, `packages/db/src/index.ts`.
- API: `apps/api/src/modules/observations/{service,routes}.ts`, montado em `apps/api/src/app.ts`.
- Migração: `apps/api/migrations/0013_overrated_nebula.sql`, journal/snapshot atualizados. FK de `area_id` aplicada no SQL; referência Drizzle omitida no schema por workaround de import circular do drizzle-kit; snapshot mantido consistente.
- Web: `apps/web/src/features/observations/ObservationsPage.tsx`, `apps/web/src/lib/api.ts`, navegação/ícone/rota `/observacoes`.
- Backup allowlist: `scripts/lib/d1-ops.mjs` atualizado com `personal_observations`.
- Docs: `docs/API_CONTRACTS.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/decisions/0024-observacoes-pessoais-e-evidencias.md`, `docs/decisions/README.md`, `docs/autonomous/CURRENT_STATE.md`.

## Testes adicionados/atualizados
- Domínio: `packages/domain/test/observations.test.ts`.
- API integração: `apps/api/test/observations/observations-api.test.ts`.
- Migração: `apps/api/test/db/observations-migration.test.ts`.
- E2E isolado: `apps/web/e2e/observations.spec.ts` (8789).
- Ajustes de suporte: `apps/api/test/db/helpers.ts` (0013 + reset robusto), `apps/web/test/navigation.test.ts`.

## Validações

| Comando | Resultado | Evidência |
|---|---|---|
| `npm run format:check` | PASS (exit 0) | execução local 2026-11-27 |
| `npm run lint` | PASS (exit 0) | execução local 2026-11-27 |
| `npm run typecheck` | PASS (exit 0) | execução local 2026-11-27 |
| `npm run test -w @personal-os/domain -- --run test/observations.test.ts` | PASS (1 file, 5 tests) | execução local 2026-11-27 |
| `npm run test -w @personal-os/api -- test/observations/observations-api.test.ts` | PASS (1 file, 5 tests) | `/tmp/opencode/d37-obs-api-test7.log` |
| `npm run test -w @personal-os/web --` | PASS (23 files, 121 tests) | execução local 2026-11-27 |
| `npm run test:integration` | PASS (15 files, 55 tests, exit 0) | `/tmp/opencode/d37-test-integration.log` |
| `npm run build` | PASS (exit 0) | `/tmp/opencode/d37-build.log` |
| `npm run db:generate` | PASS (no schema changes) | execução local 2026-11-27 |
| `npm run backup:drill` | PASS (exit 0) | `/tmp/opencode/d37-backup-drill4.log`, summary `/tmp/opencode/personal-os-drill-0ySLkw/drill-summary.json` |
| `npm run deploy:check` | PASS (exit 0) | `/tmp/opencode/d37-deploy-check.log` |
| `PLAYWRIGHT_BASE_URL=https://localhost:8789 npx playwright test apps/web/e2e/observations.spec.ts --project=chromium` | PASS (1 passed, exit 0) | `/tmp/opencode/d37-observations-e2e6.log` |
| `npm test` (full workspace) | PASS (exit 0; web 23 files/121 tests, api 46 files/254 tests, autonomous 8 files/40 tests) | `/tmp/opencode/d37-npm-test-final.log` |

## Ambiente E2E isolado
- Base URL: `https://localhost:8789` (não usado 8788).
- Browser env: `/tmp/opencode/d36-browser-env` (src/migrations symlinkados ao repo; D1 local isolado).
- Assets: `/tmp/opencode/web-d36/dist` sincronizado com build D37.
- Migração 0013 aplicada no D1 local do env 8789.

## Limitações / ressalvas
- `npm test` completo ainda em execução no momento da escrita desta evidência; resultado final deve ser anexado antes do fechamento.
- Resumo D37 usa cobertura por dias com observação; períodos sem observação aparecem como lacunas, não zeros.
- Indicadores D37 são baseados em observações pessoais registradas; não inferem causalidade nem substituem domínios especializados.
- Worktree permanece dirty com alterações preexistentes/D36/D37 não commitadas; nenhuma operação git destrutiva realizada.

## Preservação / segurança / custo
- Sem reset/clean/checkout destrutivo; sem commit/push; sem deploy; sem migração remota; sem escrita em D1/R2/DNS/secrets/billing/remote/prod.
- Ambiente manual `https://localhost:8788` preservado.
- R$ 0 recorrente; Cloudflare Free; sem serviços/deps pagas.
