import type { Env } from '../src/env';

declare module 'cloudflare:workers' {
  // Interface vazia: apenas estende Env via declaration merging para tipar `env` nos testes.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ProvidedEnv extends Env {}
}

declare global {
  namespace Cloudflare {
    // `env` de `cloudflare:workers` é tipado como Cloudflare.Env nos workers-types atuais.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Env extends EnvAppBindings {}
  }
}

type EnvAppBindings = Env;
