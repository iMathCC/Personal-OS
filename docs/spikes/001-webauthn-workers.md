# Spike 001 — WebAuthn no Cloudflare Workers

- **Data:** 2026-11-20
- **Escopo:** Entrega 1 da Tarefa 1.2
- **Status:** Concluído; sem bloqueio para a Entrega 2
- **Tipo de documento:** relatório técnico reproduzível; não é ADR nem decisão de produto

## 1. Objetivo

Verificar, antes de implementar schema, migrações ou endpoints, se `@simplewebauthn/server` executa registro e verificação de credenciais dentro do runtime Cloudflare Workers usado pelo projeto, observando:

- compatibilidade com `@cloudflare/vitest-plugin` e Miniflare;
- validação de `UP`, `UV`, `origin` e RP ID;
- comportamento do contador WebAuthn;
- latência local, explicitamente **latência, não CPU**.

## 2. Ambiente

| Item | Versão |
| --- | --- |
| Node.js | 24.22.3 |
| npm | 11.19.1 |
| TypeScript | 6.0.3 |
| Vitest | 4.1.12 |
| `@cloudflare/vitest-plugin` | 1.9.0 |
| Wrangler | 4.166.0 |
| `@simplewebauthn/server` | 14.1.0 |
| `@simplewebauthn/browser` | não instalado; frontend fora do escopo |
| `compatibility_date` | 2026-11-20 |
| `nodejs_compat` | não habilitado; não foi necessário |

Foram instaladas 24 dependências transitivas junto de `@simplewebauthn/server`, incluindo `@peculiar/asn1-schema`, `@peculiar/x509`, `@hexagon/base64`, `@levischuck/tiny-cbor` e `reflect-metadata`. Nenhuma API Node foi adicionada ao Worker.

## 3. Arquivos do spike

### Criados

- `apps/api/test/spike/webauthn-workers.test.ts`
- `apps/api/test/spike/virtual-authenticator.ts`
- `docs/spikes/001-webauthn-workers.md`

### Modificados

- `apps/api/package.json` — dependência exata `@simplewebauthn/server@14.1.0`
- `package-lock.json` — atualização gerada pelo `npm install`
- `apps/api/test/env.d.ts` — tipagem de `env.DB` no runtime de testes

Não houve criação de schema, migração, endpoint de autenticação, frontend ou deploy.

## 4. Comandos executados

```bash
export PATH="$HOME/.local/share/node24/bin:$PATH"

npm install --workspace @personal-os/api --save-exact @simplewebauthn/server@14.1.0

cd apps/api
npx vitest run test/spike/webauthn-workers.test.ts --reporter=verbose

cd ..
npm run typecheck
npm run lint
npm run format:check
npm run build
npm test
npm audit --audit-level=high
npm ci
npm test
```

## 5. Metodologia

O teste roda dentro do pool do `@cloudflare/vitest-plugin`, usando `wrangler.local.toml`. A evidência de runtime é dupla:

1. o teste importa `env` de `cloudflare:workers` e executa `SELECT 1` no binding D1 local;
2. a geração e a verificação WebAuthn usam `crypto.subtle`, `TextEncoder`, `btoa`/`atob` e CBOR dentro desse mesmo runtime.

O autenticador virtual foi implementado no próprio teste; ele:

- gera um par ECDSA P-256 com WebCrypto;
- codifica a chave pública em COSE;
- constrói `authData` real, com hash do RP ID, flags UP/UV/AT e signCount;
- codifica o `attestationObject` `fmt=none` em CBOR;
- assina a asserção com ECDSA/SHA-256;
- converte a assinatura raw do WebCrypto para DER, formato exigido pelo WebAuthn e pelo `@simplewebauthn/server`.

Não houve mock da biblioteca: `generateRegistrationOptions`, `verifyRegistrationResponse`, `generateAuthenticationOptions` e `verifyAuthenticationResponse` foram executados de verdade.

## 6. Resultados

Suíte executada com sucesso: **15 testes aprovados, 0 falhas**.

### 6.1 Evidência de execução no Workers

- `env.DB.prepare('SELECT 1 AS ok').first()` retornou `1`.
- `crypto.subtle` esteve disponível no runtime de teste.
- Nenhum `Buffer`, `node:*`, polyfill ou `nodejs_compat` foi necessário.

### 6.2 Registro

Verificado com sucesso:

- credencial real com `fmt=none`;
- `UP=true`, `UV=true`;
- `origin=https://personal-os.test`;
- RP ID `personal-os.test`;
- contador inicial `0`.

Rejeições esperadas confirmadas:

- registro sem UP;
- registro sem UV;
- `origin` incorreta;
- RP ID incorreto.

### 6.3 Autenticação

Verificado com sucesso:

- assinatura ECDSA real;
- `UP=true`, `UV=true`;
- `origin` e RP ID corretos;
- `newCounter` retornado pela biblioteca.

Rejeições esperadas confirmadas:

- asserção sem UV;
- `origin` incorreta;
- RP ID incorreto.

## 7. Comportamento dos contadores

Observações diretas do `@simplewebauthn/server@14.1.0`:

| Cenário | Resultado observado |
| --- | --- |
| Contador `0`, armazenado `0` | Aceito; `newCounter=0` |
| Contador crescente, por exemplo `5` com armazenado `0` | Aceito; `newCounter=5` |
| Contador igual ao armazenado, quando maior que zero | Rejeitado com `Response counter value N was lower than expected N` |
| Contador regressivo | Rejeitado com `Response counter value X was lower than expected Y` |

A biblioteca implementa a verificação clássica:

```text
(counter > 0 || credential.counter > 0) && counter <= credential.counter
```

Portanto, contador zero é compatível, mas contador igual/regressivo não é aceito automaticamente pela biblioteca. Isso **não bloqueia a Entrega 2**, mas exige que a Entrega 3 implemente a política aprovada com uma camada explícita de classificação de anomalia, sem silenciar falha de assinatura, UP, UV, `origin` ou RP ID. O spike não implementou essa camada.

## 8. Latência local

Medição de 30 verificações de registro e 30 verificações de asserção no runtime local:

| Operação | Média | p50 | p95 | Máximo |
| --- | ---: | ---: | ---: | ---: |
| `verifyRegistrationResponse` | 0,267 ms | 0 ms | 1 ms | 1 ms |
| `verifyAuthenticationResponse` | 0,467 ms | 0 ms | 1 ms | 1 ms |

Saída bruta:

```json
{
  "registration": { "samples": 30, "meanMs": 0.267, "p50Ms": 0, "p95Ms": 1, "maxMs": 1 },
  "authentication": { "samples": 30, "meanMs": 0.467, "p50Ms": 0, "p95Ms": 1, "maxMs": 1 },
  "observacao": "Latência local medida no Miniflare; não representa CPU do Cloudflare Workers."
}
```

O relógio local apresentou granularidade próxima de 1 ms, o que explica p50 em `0 ms`. Esses números são apenas uma indicação local de viabilidade. **Não são medição de CPU** e não validam o gate de 8–10 ms do `ROADMAP.md`.

## 9. Limitações

1. CPU efetiva no Cloudflare Workers publicado não foi medida.
2. Comportamento real de passkeys em `workers.dev`, Safari e iOS não foi testado.
3. O autenticador virtual usa ECDSA P-256 e atestação `none`; outros algoritmos e formatos de atestação não foram exercitados.
4. O teste cobre flags UP/UV, origem, RP ID e contador, mas não cobre extensions, token binding, backup flags nem passkeys híbridas.
5. A política de contador igual/regressivo aprovada no planejamento ainda precisa de implementação explícita na Entrega 3, porque a biblioteca rejeita esses casos por padrão.
6. A medição de latência é sensível à granularidade do relógio do Miniflare e ao ambiente da máquina local.
7. A dependência transitiva `@peculiar/asn1-schema` foi exercitada com sucesso no runtime de teste; a compatibilidade em todas as versões futuras da biblioteca deve ser revalidada em upgrade.

## 10. Conclusão

**Aprovado para a Entrega 2.** Não foi identificada incompatibilidade com o runtime Cloudflare Workers, necessidade de polyfill relevante, alteração de biblioteca ou mudança arquitetural. O gate de CPU em produção permanece pendente e não deve ser marcado como atendido.
