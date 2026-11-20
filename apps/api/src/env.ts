export interface Env {
  DB: D1Database;
  APP_VERSION: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    requestId: string;
  };
};
