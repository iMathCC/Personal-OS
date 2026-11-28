import type { createDb, SessionRow } from '@personal-os/db';

export interface Env {
  DB: D1Database;
  // Disponível apenas em wrangler.local.toml; ausente em produção.
  DB_TEST?: D1Database;
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
    /** Fuso da conta autenticada; usado para `local_date` e filtros de período. */
    userTimezone: string;
    sessionToken: string | null;
    sessionTokenHash: string | null;
    posVid: string;
    /** NULL quando não há origem confiável; nunca string vazia. */
    ipHash: string | null;
    /** Origem usada pelo limitador; `unavailable` falha fechado. */
    originKind: 'trusted-ip' | 'local-test' | 'unavailable';
    csrfToken: string | null;
    authFailure: boolean;
    /** Código estável do erro, usado apenas em logs estruturados. */
    errorCode: string | null;
  };
};
