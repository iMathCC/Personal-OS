import { env } from 'cloudflare:workers';
import { app } from '../../src/app';
import { applyFullSchema, resetDatabase, testDb } from '../db/helpers';
import { VirtualAuthenticator } from '../spike/virtual-authenticator';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';

export const ORIGIN = 'https://personal-os.test';
export const RP_ID = 'personal-os.test';
export const SETUP_TOKEN = 'local-setup-token';

export { testDb } from '../db/helpers';

export function testEnv() {
  return { ...env, DB: testDb() };
}

export async function resetAuthDatabase(): Promise<void> {
  await resetDatabase();
  await applyFullSchema();
}

export interface Client {
  cookies: Record<string, string>;
  csrf: string;
  request(
    path: string,
    init?: RequestInit & { json?: unknown; skipCsrf?: boolean; skipOrigin?: boolean },
  ): Promise<Response>;
  refreshCsrf(): Promise<void>;
}

/** Devolve `true` quando a resposta encerrou a sessão deste cliente. */
function mergeCookies(target: Record<string, string>, response: Response): boolean {
  const setCookies = response.headers.getSetCookie?.() ?? [];
  let sessionCleared = false;
  for (const entry of setCookies) {
    const pair = entry.split(';')[0] ?? '';
    const separator = pair.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (value.length === 0) {
      delete target[name];
      if (name === '__Host-pos_session') {
        sessionCleared = true;
      }
    } else {
      target[name] = value;
    }
  }
  return sessionCleared;
}

function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

export async function newClient(
  ip = '203.0.113.10',
  userAgent = 'Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0',
): Promise<Client> {
  const cookies: Record<string, string> = {};

  const client: Client = {
    cookies,
    csrf: '',
    async request(path, init = {}) {
      const { json, headers: customHeaders, skipCsrf, skipOrigin, ...rest } = init;
      const headers = new Headers(customHeaders);
      headers.set('Accept', 'application/json');
      if (!skipOrigin && !headers.has('Origin')) {
        headers.set('Origin', ORIGIN);
      }
      headers.set('CF-Connecting-IP', ip);
      headers.set('User-Agent', userAgent);
      if (Object.keys(cookies).length > 0) {
        headers.set('Cookie', cookieHeader(cookies));
      }
      const isMutation =
        rest.method !== undefined && rest.method !== 'GET' && rest.method !== 'HEAD';
      if (isMutation) {
        if (!headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/json');
        }
        if (!skipCsrf && !headers.has('X-CSRF-Token')) {
          headers.set('X-CSRF-Token', client.csrf);
        }
      }
      const response = await app.request(
        `https://personal-os.test/api/v1${path}`,
        {
          ...rest,
          headers,
          body: json === undefined ? rest.body : JSON.stringify(json),
        },
        testEnv(),
      );
      const sessionCleared = mergeCookies(cookies, response);
      if (sessionCleared) {
        // O subject do CSRF muda de `session:<hash>` para `anon:<vid>`.
        await client.refreshCsrf();
      }
      return response;
    },
    async refreshCsrf() {
      const response = await client.request('/auth/csrf');
      if (!response.ok) {
        throw new Error(`Falha ao renovar CSRF: ${response.status}`);
      }
      const body = (await response.json()) as { data: { csrfToken: string } };
      client.csrf = body.data.csrfToken;
    },
  };

  await client.refreshCsrf();
  return client;
}

export async function bodyOf<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export interface SetupResult {
  client: Client;
  authenticator: VirtualAuthenticator;
  recoveryCodes: string[];
  sessionToken: string;
  userId: string;
}

export async function performSetup(
  existingAuthenticator?: VirtualAuthenticator,
): Promise<SetupResult> {
  const client = await newClient();
  const authenticator =
    existingAuthenticator ?? (await VirtualAuthenticator.create({ rpId: RP_ID, origin: ORIGIN }));

  const optionsResponse = await client.request('/auth/setup/options', {
    method: 'POST',
    json: {},
    headers: { 'X-Setup-Token': SETUP_TOKEN },
  });
  if (!optionsResponse.ok) {
    throw new Error(`Falha no setup/options: ${optionsResponse.status}`);
  }
  const optionsBody = await bodyOf<{
    data: { challengeId: string; options: PublicKeyCredentialCreationOptionsJSON };
  }>(optionsResponse);

  const credential = await authenticator.createRegistrationResponse(optionsBody.data.options);
  const verifyResponse = await client.request('/auth/setup/verify', {
    method: 'POST',
    json: {
      challengeId: optionsBody.data.challengeId,
      credential,
      displayName: 'Usuário de teste',
      timezone: 'America/Sao_Paulo',
      passkeyName: 'Passkey de teste',
    },
    headers: { 'X-Setup-Token': SETUP_TOKEN },
  });
  if (!verifyResponse.ok) {
    throw new Error(
      `Falha no setup/verify: ${verifyResponse.status} ${await verifyResponse.text()}`,
    );
  }
  await client.refreshCsrf();
  const verified = await bodyOf<{
    data: { recoveryCodes: string[]; user: { id: string } };
  }>(verifyResponse);

  return {
    client,
    authenticator,
    recoveryCodes: verified.data.recoveryCodes,
    sessionToken: client.cookies['__Host-pos_session'] ?? '',
    userId: verified.data.user.id,
  };
}

export async function loginWith(
  client: Client,
  authenticator: VirtualAuthenticator,
): Promise<Response> {
  const optionsResponse = await client.request('/auth/login/options', { method: 'POST', json: {} });
  const optionsBody = await bodyOf<{
    data: { challengeId: string; options: PublicKeyCredentialRequestOptionsJSON };
  }>(optionsResponse);
  const credential: AuthenticationResponseJSON = await authenticator.createAuthenticationResponse(
    optionsBody.data.options,
  );
  const response = await client.request('/auth/login/verify', {
    method: 'POST',
    json: { challengeId: optionsBody.data.challengeId, credential },
  });
  if (response.ok) {
    await client.refreshCsrf();
  }
  return response;
}

export async function registerWithRecovery(
  client: Client,
  recoveryToken: string,
  authenticator: VirtualAuthenticator,
): Promise<Response> {
  const optionsResponse = await client.request('/auth/recovery/register/options', {
    method: 'POST',
    json: { recoveryToken },
  });
  if (!optionsResponse.ok) {
    return optionsResponse;
  }
  const optionsBody = await bodyOf<{
    data: { challengeId: string; options: PublicKeyCredentialCreationOptionsJSON };
  }>(optionsResponse);
  const credential: RegistrationResponseJSON = await authenticator.createRegistrationResponse(
    optionsBody.data.options,
  );
  return client.request('/auth/recovery/register/verify', {
    method: 'POST',
    json: {
      recoveryToken,
      challengeId: optionsBody.data.challengeId,
      credential,
      passkeyName: 'Passkey recuperada',
    },
  });
}

export async function auditRows(): Promise<
  Array<{
    action: string;
    entity_type: string;
    request_id: string | null;
    ip_hash: string | null;
    after_json: string | null;
  }>
> {
  const database = testDb();
  const result = await database
    .prepare(
      'SELECT action, entity_type, request_id, ip_hash, after_json FROM audit_log ORDER BY id ASC',
    )
    .all<{
      action: string;
      entity_type: string;
      request_id: string | null;
      ip_hash: string | null;
      after_json: string | null;
    }>();
  return result.results;
}
