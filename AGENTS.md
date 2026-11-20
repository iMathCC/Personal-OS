# AGENTS.md — Regras permanentes do Personal OS

Este arquivo vale para **agentes de IA e desenvolvedores humanos**. Leia antes de qualquer alteração.

## 1. Fonte de verdade

Leia, nesta ordem, antes de implementar:

1. `docs/PRODUCT_SPEC.md` — o que o sistema deve fazer e o que está fora do escopo.
2. `docs/ARCHITECTURE.md` — como o sistema é organizado e quais limites existem.
3. `docs/DATA_MODEL.md` — schema, proveniência, índices e retenção.
4. `docs/API_CONTRACTS.md` — contratos externos.
5. `docs/SECURITY.md` — requisitos de segurança.
6. `docs/ROADMAP.md` — fase atual e critérios de aceite.
7. `docs/decisions/` — decisões já tomadas; não as reverta sem um novo ADR.

Em caso de conflito: **decisão aprovada > documento > preferência pessoal**. Se algo não estiver documentado, não invente requisito: proponha e peça aprovação.

## 2. Estado atual

- **Fase 0 (planejamento) concluída.** Não implemente funcionalidades antes da aprovação da Fase 1.
- A Fase 1 começa pela tarefa 1.1 do roadmap (bootstrap do monorepo).
- Nenhuma dependência paga, nenhum serviço que exija cartão, nenhum segredo no repositório.

## 3. Regras arquiteturais invioláveis

- **Monólito modular.** Não crie microsserviços, multiagente, filas ou bancos adicionais sem necessidade comprovada e ADR aprovado.
- **API é a única porta de acesso aos dados.** O frontend nunca importa Drizzle, acessa D1/R2 ou chama serviços externos diretamente (exceto assets estáticos).
- **Domínio puro.** `packages/domain` não importa Hono, Drizzle, Cloudflare, React ou `node:*`. Recebe dados, retorna resultados, lança erros de domínio.
- **Sem acesso cruzado entre módulos da API.** Um módulo não importa o repositório de outro; use serviços/contratos.
- **Contratos primeiro.** Tipos e schemas Zod em `packages/shared`; frontend e backend consomem o mesmo contrato.
- **Proveniência obrigatória.** Todo dado de domínio tem `source_id`; inferência tem `confidence`; cálculo tem `algorithm_version`.
- **Histórico preservado.** Não sobrescreva fatos silenciosamente; use correção com `superseded_by` + auditoria. Não implemente event sourcing.
- **Auditoria atômica.** Mutação + `audit_log` no mesmo `db.batch()`.
- **Sem transações interativas no D1.** Use `db.batch()`; nunca mantenha transação entre awaits.
- **Dinheiro em centavos (`INTEGER`).** Proibido `float` para saldo.
- **Tempo em UTC ISO-8601 com ms + `local_date`.** Nunca use o fuso do servidor para “hoje”.
- **IDs UUIDv7.** Não use auto-incremento em entidades de domínio.
- **Sem `SELECT *` em produção.** Selecione colunas explicitamente.
- **Toda FK tem índice.** Toda consulta nova deve ter índice justificado.

## 4. Regras de segurança

- Nunca commite segredos, tokens, `.dev.vars`, `.env*`, dumps ou dados reais.
- Toda entrada é validada com Zod; toda saída passa por DTO allowlist.
- Nunca use `dangerouslySetInnerHTML` sem sanitização; nunca renderize HTML de LLM sem sanitizar.
- Toda mutação exige sessão + CSRF; toda rota autenticada valida sessão.
- Não logue cookies, tokens, notas, valores financeiros ou dados de saúde.
- Novas dependências exigem justificativa no PR (motivo, alternativa, manutenção, licença, tamanho).
- `npm audit` não pode ter high/critical no merge.
- Não relaxe CSP/headers sem justificativa e revisão.
- Não habilite IA externa por padrão; não envie dados sem consentimento.
- Não execute operações destrutivas (drop, purge, force push, deleção de banco/R2) sem autorização explícita do usuário.

## 5. Convenções de código

### TypeScript

- `strict: true`; sem `any` não justificado; prefira `unknown` + validação.
- Sem `as` para “resolver” tipos; use type guards/schemas.
- Exportações nomeadas; evitar default exports (exceto entrypoints exigidos por ferramenta).
- Funções pequenas e puras quando possível; dependências injetadas (clock, rng, repositórios).
- Erros de domínio tipados (`DomainError` com `code`), não strings soltas.

### Banco

- `snake_case` no banco, `camelCase` na API.
- Enums como `TEXT` + `CHECK`; lookup table só se editável pelo usuário.
- Migrações geradas pelo Drizzle Kit, numeradas, imutáveis após aplicação.
- Nunca edite migração aplicada; crie uma nova.
- Seeds idempotentes; nunca seed de dados fictícios em produção.
- Teste migração do zero e upgrade.

### API

- Rotas em `/api/v1`; contratos em `packages/shared`.
- Envelope `{ data, meta }` / `{ error: { code, message, details, requestId } }`.
- Paginação por cursor (`limit` ≤ 200); sem `OFFSET`.
- `Idempotency-Key` em POST de criação; `If-Match`/`version` em mutações.
- Status HTTP corretos; erros de negócio com `code` estável.
- Handlers ≤ 10 ms de CPU: sem KDF caro, sem processamento pesado, sem varredura.
- Máximo ~8 queries por requisição.

### Frontend

- Componentes funcionais; hooks; sem classes.
- Estado de servidor via TanStack Query (quando adotado); estado local mínimo.
- Formulários com react-hook-form + Zod (quando adotado).
- ECharts somente via wrapper lazy; imports seletivos (`echarts/core`).
- Acessibilidade: foco visível, rótulos, teclado, contraste AA, alvos ≥ 44 px.
- Responsivo de 360 px a 1920 px.
- Sem chamadas `fetch` espalhadas: use `lib/api` tipado.
- Nunca armazene tokens em `localStorage`.

### Estilo

- ESLint + Prettier; sem debates de formatação.
- Nomes descritivos; comentários explicam **por quê**, não o óbvio.
- Markdown de documentação em pt-BR; código/identificadores em inglês.
- Commits em Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).

## 6. Testes

- Toda regra de negócio relevante tem teste unitário em `packages/domain`.
- Todo endpoint novo tem teste de integração (sucesso + erro + auth + validação).
- Todo bug corrigido ganha teste de regressão.
- Use relógio e PRNG injetáveis; testes determinísticos.
- Sem PII real em fixtures.
- Cobertura mínima de domínio: 90%; não persiga cobertura global às custas de testes úteis.
- Teste de export/restauração e de auditoria são obrigatórios nas fases correspondentes.
- Não marque tarefa como concluída sem rodar os testes e verificar o resultado.

## 7. Git e CI

- `main` protegida; PR obrigatório; CI verde.
- Não faça force push em `main`.
- Um PR = uma mudança coerente; não misture refatoração ampla com feature.
- Atualize a documentação no mesmo PR da mudança.
- Decisão estrutural → ADR novo/atualizado.
- Deploy apenas via CI; migração em workflow separado com aprovação.
- Nunca commite `dist/`, `node_modules/`, `.wrangler/`, exports ou backups.

## 8. Comandos esperados (após Fase 1)

```bash
# raiz
npm ci
npm run dev          # web + api (ou processos separados)
npm run build
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run db:generate  # drizzle-kit generate
npm run db:migrate:local
npm run db:seed:local

# api
npm run dev -w apps/api
npx wrangler tail

# web
npm run dev -w apps/web
```

Se um comando documentado não funcionar, corrija a documentação ou o código — não ignore.

## 9. Definition of Done

Uma tarefa só está concluída quando:

- [ ] Critério de aceite da tarefa foi demonstrado (não presumido).
- [ ] Código tipado, lint e testes passam localmente e no CI.
- [ ] Regras de negócio têm teste; erros e autorização cobertos.
- [ ] Migração (se houver) testada do zero e upgrade.
- [ ] Auditoria/proveniência implementadas.
- [ ] Segurança revisada (checklist do SECURITY.md).
- [ ] Performance dentro dos budgets (CPU, queries, bundle).
- [ ] Documentação e ADR atualizados.
- [ ] Aplicação continua executável ao final da etapa.
- [ ] Nenhum segredo/dado real no diff.

## 10. O que não fazer

- Não adicionar requisitos não solicitados.
- Não trocar a stack sem ADR e aprovação.
- Não adicionar dependência sem justificativa.
- Não implementar multiusuário, E2EE, push, Open Finance ou offline com escrita sem decisão.
- Não usar IA para calcular números oficiais.
- Não executar recomendações automaticamente.
- Não “otimizar” prematuramente com cache/denormalização sem medir.
- Não deletar dados do usuário sem confirmação e exportação.
- Não esconder falhas com `catch {}` silencioso.
- Não usar `console.log` com PII.
- Não commitar código gerado sem revisão.

## 11. Quando parar e perguntar

- Requisito ambíguo ou conflitante.
- Necessidade de dependência paga ou serviço externo.
- Mudança de schema destrutiva.
- Alteração de autenticação, criptografia ou retenção.
- Decisão que afeta custo, privacidade ou portabilidade.
- Qualquer operação irreversível.

Ao parar, apresente: contexto, opções, recomendação, impacto e o que precisa de aprovação.
