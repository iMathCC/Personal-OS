import { execFileSync } from 'node:child_process';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const SETUP_TOKEN = 'browser-setup-token';
const BROWSER_ENV_DIR = '/tmp/opencode/browser-env';
const BROWSER_CONFIG = `${BROWSER_ENV_DIR}/wrangler.browser.toml`;
const WRANGLER = `${process.cwd()}/node_modules/wrangler/bin/wrangler.js`;

const AUTHENTICATOR_OPTIONS = {
  protocol: 'ctap2',
  transport: 'internal',
  hasResidentKey: true,
  hasUserVerification: true,
  isUserVerified: true,
  automaticPresenceSimulation: true,
};

interface AuthenticatorHarness {
  /** Troca o dispositivo virtual: recuperação deve funcionar em outro aparelho. */
  replaceWithNewDevice(): Promise<void>;
}

function d1Exec(sql: string): void {
  execFileSync(
    process.execPath,
    [
      WRANGLER,
      'd1',
      'execute',
      'DB',
      '--local',
      '--yes',
      '--config',
      BROWSER_CONFIG,
      '--command',
      sql,
    ],
    { cwd: BROWSER_ENV_DIR, encoding: 'utf8', stdio: 'pipe' },
  );
}

function resetBrowserAuthState(): void {
  // Limpa estado de autenticação e guards/idempotência do browser-env local
  // para que o fluxo completo de setup seja determinístico. O guard setup:single
  // vive em idempotency_keys; sem limpá-lo, o reset de users causa UNIQUE falso.
  const statements = [
    'DELETE FROM auth_challenges;',
    'DELETE FROM recovery_tokens;',
    'DELETE FROM recovery_codes;',
    'DELETE FROM sessions;',
    'DELETE FROM passkeys;',
    'DELETE FROM users;',
    'DELETE FROM rate_limits;',
    // idempotency_key_reservations e operation_results são append-only por trigger.
    'DELETE FROM idempotency_keys;',
  ];
  for (const sql of statements) d1Exec(sql);
}

async function enableVirtualAuthenticator(
  context: BrowserContext,
  page: Page,
): Promise<AuthenticatorHarness> {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const result: unknown = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: AUTHENTICATOR_OPTIONS,
  });
  if (
    typeof result !== 'object' ||
    result === null ||
    !('authenticatorId' in result) ||
    typeof result.authenticatorId !== 'string'
  ) {
    throw new Error('CDP não retornou authenticatorId.');
  }
  const authenticatorId = result.authenticatorId;

  return {
    async replaceWithNewDevice(): Promise<void> {
      await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
      await cdp.send('WebAuthn.addVirtualAuthenticator', { options: AUTHENTICATOR_OPTIONS });
    },
  };
}

test.describe('autenticação real com passkey', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Autenticador virtual via CDP existe apenas no Chromium.',
  );

  test('setup, login, estudos, logout, revogação, expiração e recuperação', async ({
    page,
    context,
  }) => {
    resetBrowserAuthState();
    const authenticator = await enableVirtualAuthenticator(context, page);
    await page.goto('/');

    await page.getByRole('button', { name: 'Primeiro acesso' }).click();
    await page.locator('#setup-token').fill(SETUP_TOKEN);
    await page.locator('#display-name').fill('Teste Navegador');
    await page.locator('#timezone').fill('America/Sao_Paulo');
    await page.locator('#passkey-name').fill('Passkey A');
    await page.getByRole('button', { name: 'Criar passkey' }).click();

    await expect(page.getByRole('heading', { name: 'Guarde seus códigos' })).toBeVisible();
    const codes = await page.locator('ol li').allTextContents();
    expect(codes).toHaveLength(10);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByRole('button', { name: 'Encerrar sessão' })).toBeVisible();

    const cookies = await context.cookies();
    const sessionCookie = cookies.find((cookie) => cookie.name === '__Host-pos_session');
    expect(sessionCookie).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax' });

    const nav = page.getByRole('navigation', { name: 'Navegação principal' });
    await nav.getByRole('link', { name: 'Estudos', exact: true }).click();
    await expect(
      page.getByRole('main').getByRole('heading', { name: 'Estudos', exact: true }),
    ).toBeVisible();

    const courseForm = page.locator('form').filter({ hasText: 'Novo curso' });
    await courseForm.getByLabel('Título').fill('Curso via navegador');
    await courseForm.getByRole('button', { name: 'Criar curso' }).click();
    await expect(page.getByText('Curso criado com sucesso.')).toBeVisible();

    const sessionForm = page.locator('form').filter({ hasText: 'Registrar sessão' });
    await sessionForm.getByLabel('Tópico').fill('Sessão via navegador');
    await sessionForm.getByLabel('Duração (min)').fill('45');
    await sessionForm.getByRole('button', { name: 'Registrar sessão' }).click();
    await expect(page.getByText('Sessão registrada com sucesso.')).toBeVisible();
    await expect(page.getByText('Sessão via navegador').first()).toBeVisible();
    await expect(page.getByText(/45 min/).first()).toBeVisible();

    await nav.getByRole('link', { name: 'Configurações', exact: true }).click();
    await expect(
      page.getByRole('main').getByRole('heading', { name: 'Configurações' }),
    ).toBeVisible();
    await expect(page.locator('dd').nth(5)).toHaveText('1');

    await page.getByRole('button', { name: 'Encerrar esta sessão' }).click();
    await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
    expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
    const afterLogout = await page.evaluate(async () => await caches.keys());
    expect(afterLogout.every((name) => name.startsWith('workbox-precache-v2-'))).toBe(true);

    await page.getByRole('button', { name: 'Entrar com passkey' }).click();
    await expect(page.getByRole('button', { name: 'Encerrar sessão' })).toBeVisible();

    await nav.getByRole('link', { name: 'Configurações', exact: true }).click();
    await page.getByRole('button', { name: 'Encerrar todas' }).click();
    await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();

    // Sessão ausente (cookies removidos): a aplicação volta ao fluxo de login.
    await context.clearCookies();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();

    await page.getByRole('button', { name: 'Recuperar acesso' }).click();
    await page.locator('#recovery-code').fill(codes[0] ?? '');
    await page.getByRole('button', { name: 'Validar código' }).click();
    await expect(page.getByRole('heading', { name: 'Nova passkey' })).toBeVisible();
    // O dispositivo original foi perdido: use um autenticador virtual novo.
    await authenticator.replaceWithNewDevice();
    await page.locator('#recovery-passkey-name').fill('Passkey B');
    await page.getByRole('button', { name: 'Cadastrar passkey' }).click();
    await expect(page.getByText('Passkey cadastrada. Entre normalmente.')).toBeVisible();

    await page.getByRole('button', { name: 'Entrar com passkey' }).click();
    await expect(page.getByRole('button', { name: 'Encerrar sessão' })).toBeVisible();
    await nav.getByRole('link', { name: 'Configurações', exact: true }).click();
    await expect(page.locator('dd').nth(5)).toHaveText('2');
  });
});
