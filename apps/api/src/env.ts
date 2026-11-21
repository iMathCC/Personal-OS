import type { createDb, SessionRow } from '@personal-os/db';

export interface Env {
  DB: D1Database;
  // Disponível apenas em wrangler.local.toml; usado por testes com banco descartável.
  DB_TEST: D1Database;
  APP_VERSION: string;
  /** Segredo do bootstrap; configurado via `wrangler secret put SETUP_TOKEN`. */
  SETUP_TOKEN: string;
  /** RP ID do WebAuthn. Nunca derivado de header. */
  RP_ID: string;
  RP_NAME: string;
  /** Lista de origens permitidas, separadas por vírgula. */
  ORIGIN: string;
  /** Segredo para assinar o cookie CSRF. */
  CSRF_SECRET: string;
  /** Salt por instalação para hashes de IP e user agent. */
  IP_HASH_SALT: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    requestId: string;
    db: ReturnType<typeof createDb>;
    /** Corpo já lido e limitado pelo middleware; as rotas nunca releem o stream. */
    rawBody: string;
    userAgent: string | null;
    setVidCookie: boolean;
    session: SessionRow | null;
    sessionToken: string | null;
    sessionTokenHash: string | null;
    posVid: string;
    ipHash: string;
    csrfToken: string | null;
    authFailure: boolean;
    /** Código estável do erro, usado apenas em logs estruturados. */
    errorCode: string | null;
  };
};
