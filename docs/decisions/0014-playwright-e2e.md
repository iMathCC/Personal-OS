# ADR-0014 — Playwright para testes de navegador (Entrega 6)

- **Status:** Aceito no escopo local da Entrega 6; uso em CI remoto e downloads de browser em ambiente de terceiros exigem aprovação separada
- **Data:** 2026-11-21
- **Relacionados:** [ADR-0003](0003-autenticacao.md), [ADR-0012](0012-invariantes-operacionais-de-auth.md), `ROADMAP.md` §5.1, `SECURITY.md`

## Contexto

A Entrega 6 pede validação operacional em navegador real: fallback SPA com deep links, headers de segurança e `no-store`, PWA/service worker com precache de interface, offline, responsividade de 360 a 1920 px, foco visível/teclado e fluxo completo de passkey (setup → login → CRUD → logout → revogação → recuperação).

Os testes existentes (`app.request` com D1 real e Vitest + renderização SSR) cobrem contratos e lógica, mas **não** exercitam WebAuthn do navegador, o service worker, o cache HTTP real, o roteamento do servidor de assets nem a acessibilidade computada. O projeto não tem CI paga e nenhuma dependência de teste de navegador.

## Decisão

Adotar `@playwright/test@1.65.1` como dependência de **desenvolvimento** para E2E local, com Chromium e Firefox instalados apenas na máquina de desenvolvimento.

1. `playwright.config.ts` aponta para `https://localhost:8788`, usa `ignoreHTTPSErrors` e `launchOptions.args: ['--ignore-certificate-errors']` **somente no Chromium de teste** por causa do certificado autoassinado do ambiente isolado.
2. O ambiente é criado por `scripts/prepare-browser-env.mjs` em `/tmp/opencode/browser-env`, com D1 descartável, `RP_ID = localhost` e valores dummy para `SETUP_TOKEN`/`CSRF_SECRET`/`IP_HASH_SALT`. `--reset` apaga somente esse estado isolado.
3. O autenticador virtual de passkey é usado via CDP no Chromium (`WebAuthn.enable`/`addVirtualAuthenticator`). A recuperação troca de autenticador, simulando dispositivo perdido. O teste equivalente no Firefox é **ignorado explicitamente** e documentado: não há API CDP equivalente para autenticador virtual.
4. Nenhuma resposta de `/api/v1/*` entra em cache. O teste offline verifica o shell precarregado e a tela de erro de conexão — não dados privados offline.
5. CSP e headers não são relaxados. A violação de CSP observada no Firefox é a sonda JIT do Zod (`Function('')`), que degrada para modo jitless; não é um erro da aplicação.

## Alternativas consideradas

| Alternativa | Por que não foi escolhida |
| --- | --- |
| Ampliar os testes `app.request`/Vitest | Não cobre WebAuthn real, service worker, cache HTTP, fallback de assets nem foco/teclado do navegador. |
| Testes manuais com checagem impressa | Não repetíveis, sem evidência automática e caros a cada mudança de PWA/auth. |
| Outro driver de navegador (Selenium/WebDriver) | Mais configuração, sem vantagem para WebAuthn via CDP e com matriz de browsers mais difícil de manter. |
| Playwright no CI remoto com browsers hospedados | Exige download/armazenamento de browsers e pode ter custo; fica bloqueado até decisão humana separada. |

## Justificativa da dependência

- **Motivo:** único meio disponível no projeto para validar fluxo real de passkey, SPA fallback, PWA/offline e acessibilidade em Chromium e Firefox.
- **Alternativa:** Vitest cobre a lógica, mas não o navegador (ver tabela).
- **Manutenção:** `@playwright/test` é pacote de desenvolvimento; browsers são instalados localmente sob demanda (`npx playwright install chromium firefox`), não versionados no repositório.
- **Licença:** Apache-2.0.
- **Tamanho:** não entra no bundle da aplicação; afeta apenas `node_modules`/CI. A auditoria atual reporta 8 vulnerabilidades **moderadas** em `glob`/`minimatch` via `workbox-build` (já presentes pelo `vite-plugin-pwa`), sem high/critical; `npm audit --audit-level=high` passa.

## Consequências

- Positivas: 13 cenários executados automaticamente (12 shell + 1 auth), com evidência de deep links, headers, PWA, offline, responsividade e fluxo de auth real.
- Negativas: dependência de downloads de browsers para rodar E2E em outra máquina; o teste de passkey no Firefox permanece ignorado por limitação de automação.
- Riscos: `RP_ID = localhost` é específico do ambiente isolado; produção deve usar RP ID estável decidido antes do primeiro passkey (ver `docs/operations/deploy.md`).

## Critérios de revisão

- Se o fluxo de auth mudar (novo challenge, cookies, RP ID), revisar o harness de autenticador virtual.
- Se o CI passar a executar E2E, aprovar antes o custo de minutos/browser e a política de instalação.
- Se `npm audit` passar a reportar high/critical, atualizar ou substituir o plugin antes do merge.
