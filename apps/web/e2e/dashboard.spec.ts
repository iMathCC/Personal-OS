import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { injectApiFault } from './helpers/fault-injection';

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

async function enableVirtualAuthenticator(context: BrowserContext, page: Page): Promise<void> {
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
}

function d1Json<T>(sql: string): T[] {
  const out = execFileSync(
    process.execPath,
    [
      WRANGLER,
      'd1',
      'execute',
      'DB',
      '--local',
      '--json',
      '--yes',
      '--config',
      BROWSER_CONFIG,
      '--command',
      sql,
    ],
    { cwd: BROWSER_ENV_DIR, encoding: 'utf8' },
  );
  const parsed = JSON.parse(out) as Array<{ results?: T[] }>;
  return parsed[0]?.results ?? [];
}

async function ensureAuthenticated(context: BrowserContext, page: Page): Promise<void> {
  await enableVirtualAuthenticator(context, page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Primeiro acesso' }).click();
  await page.locator('#setup-token').fill(SETUP_TOKEN);
  await page.locator('#display-name').fill('D33 Dashboard');
  await page.locator('#timezone').fill('America/Sao_Paulo');
  await page.locator('#passkey-name').fill('Passkey D33');
  await page.getByRole('button', { name: 'Criar passkey' }).click();

  const setupDone = page.getByText('O setup já foi concluído.');
  const recoveryCodes = page.getByRole('heading', { name: 'Guarde seus códigos' });
  const outcome = await Promise.race([
    recoveryCodes.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'ok' as const),
    setupDone.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'done' as const),
  ]).catch(() => 'timeout' as const);

  if (outcome === 'ok') {
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByRole('button', { name: 'Encerrar sessão' })).toBeVisible();
    return;
  }

  if (outcome === 'done') {
    // Setup já concluído por outro teste/suite: cria sessão local isolada no D1 do browser env.
    const users = d1Json<{ id: string }>('SELECT id FROM users LIMIT 1;');
    const userId = users[0]?.id;
    if (!userId) throw new Error('Setup concluído, mas usuário não encontrado no D1 de teste.');
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const sessionId = randomBytes(16).toString('hex');
    const sql =
      `INSERT INTO sessions (id, user_id, token_hash, created_at, last_seen_at, expires_at, revoked_at, user_agent_hash, ip_hash) ` +
      `VALUES ('${sessionId}','${userId}','${tokenHash}','${now}','${now}','${expiresAt}',NULL,NULL,NULL);`;
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
      { cwd: BROWSER_ENV_DIR, encoding: 'utf8' },
    );
    await context.addCookies([
      {
        name: '__Host-pos_session',
        value: token,
        domain: 'localhost',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Encerrar sessão' })).toBeVisible();
    return;
  }

  throw new Error('Falha ao autenticar no teste do dashboard.');
}

test.describe('dashboard integrado D32/D33', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Autenticador virtual via CDP existe apenas no Chromium.',
  );

  test('visão integrada, evidências, estados e resiliência', async ({ page, context }) => {
    await ensureAuthenticated(context, page);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Olá,/ })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Cobertura dos dados' })).toBeVisible();
    await expect(page.getByText(/Painel integrado:/)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Situação pessoal com evidência' }),
    ).toBeVisible();
    await expect(page.getByText(/Período: .* · gerado em/).first()).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Próxima melhor ação' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Planejamento vs execução' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Comparações entre períodos' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Resumo entre domínios' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recomendações e prioridades' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Alertas com evidência' })).toBeVisible();

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN');
    expect(bodyText).not.toContain('undefined');

    await page.setViewportSize({ width: 360, height: 800 });
    await expect(
      page.getByRole('heading', { name: 'Situação pessoal com evidência' }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // Falha controlada 429: painel integrado indisponível, sem crash/duplicação.
    await page.setViewportSize({ width: 1280, height: 800 });
    await injectApiFault(page, '**/api/v1/intelligence/life-dashboard*', {
      status: 429,
      body: { error: { code: 'RATE_LIMITED', message: 'Muitas requisições.' } },
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Olá,/ })).toBeVisible();
    await expect(page.getByText('Visão integrada indisponível')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Áreas do sistema' })).toBeVisible();

    // Falha controlada timeout: indisponível sem execução automática indevida.
    await page.unroute('**/api/v1/intelligence/life-dashboard*');
    await injectApiFault(page, '**/api/v1/intelligence/life-dashboard*', {
      delayMs: 2000,
      abort: 'timedout',
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Olá,/ })).toBeVisible();
    await expect(page.getByText('Visão integrada indisponível')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Áreas do sistema' })).toBeVisible();

    // Falha controlada 500: resiliência, sem derrubar resumos por módulo.
    await page.unroute('**/api/v1/intelligence/life-dashboard*');
    await injectApiFault(page, '**/api/v1/intelligence/life-dashboard*', {
      status: 500,
      body: { error: { code: 'INTERNAL_ERROR', message: 'Falha simulada' } },
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Olá,/ })).toBeVisible();
    await expect(page.getByText('Visão integrada indisponível')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Áreas do sistema' })).toBeVisible();
    expect(await page.locator('body').innerText()).not.toContain('NaN');
  });
});
