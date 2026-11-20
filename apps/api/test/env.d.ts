import type { Env } from '../src/env';

declare module 'cloudflare:workers' {
  // A interface precisa ficar vazia: ela apenas estende Env via declaration merging
  // para tipar `env` nos testes. Não há membros próprios a declarar.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ProvidedEnv extends Env {}
}
