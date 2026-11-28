import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
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

function d1(sql: string): void {
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
  await page.locator('#display-name').fill('D34 Adaptation');
  await page.locator('#timezone').fill('America/Sao_Paulo');
  await page.locator('#passkey-name').fill('Passkey D34');
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
    const users = d1Json<{ id: string }>('SELECT id FROM users LIMIT 1;');
    const userId = users[0]?.id;
    if (!userId) throw new Error('Usuário não encontrado no D1 de teste.');
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const sessionId = randomBytes(16).toString('hex');
    d1(
      `INSERT INTO sessions (id, user_id, token_hash, created_at, last_seen_at, expires_at, revoked_at, user_agent_hash, ip_hash) VALUES ('${sessionId}','${userId}','${tokenHash}','${now}','${now}','${expiresAt}',NULL,NULL,NULL);`,
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
  throw new Error('Falha ao autenticar no teste de adaptação.');
}

function seedAdaptationPressure(): void {
  const now = new Date().toISOString();
  const day = 24 * 60 * 60 * 1000;
  const isoAgo = (n: number) => new Date(Date.now() - n * day).toISOString();
  const localAgo = (n: number) => isoAgo(n).slice(0, 10);
  // Seed idempotente o suficiente para ambiente local: ignora erros de duplicidade.
  const statements = [
    `INSERT OR IGNORE INTO capacity_profiles (id, weekly_minutes, contingency_percent, is_active, source_id, created_at, updated_at) VALUES ('00000000-0000-4000-8000-00000000d001', 600, 10, 1, 'src_manual', '${now}', '${now}');`,
    ...[0, 1, 2].map(
      (i) =>
        `INSERT OR IGNORE INTO tasks (id, title, status, priority, due_date, source_id, created_at, updated_at) VALUES ('00000000-0000-4000-8000-00000000d10${i}', 'Tarefa D34 ${i}', 'todo', 'high', '${localAgo(5 + i)}', 'src_manual', '${isoAgo(10)}', '${now}');`,
    ),
    `INSERT OR IGNORE INTO tasks (id, title, status, priority, source_id, created_at, updated_at) VALUES ('00000000-0000-4000-8000-00000000d120', 'Tarefa bloqueada D34', 'blocked', 'medium', 'src_manual', '${isoAgo(3)}', '${now}');`,
  ];
  for (const sql of statements) d1(sql);
}

test.describe('adaptação D34 - C05 duplo clique determinístico', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Autenticador virtual via CDP existe apenas no Chromium.',
  );

  test('duplo clique em confirmar registra uma única mutação', async ({ page, context }) => {
    await ensureAuthenticated(context, page);
    d1('DELETE FROM adaptation_decisions;');
    seedAdaptationPressure();

    await page.goto('/adaptacao');
    await expect(page.getByRole('heading', { name: 'Adaptação pessoal' })).toBeVisible();
    await page.getByRole('tab', { name: 'Propostas' }).click();

    // Aguarda ao menos uma proposta.
    const acceptBtn = page.getByRole('button', { name: 'Aceitar' }).first();
    await expect(acceptBtn).toBeVisible({ timeout: 20_000 });
    await acceptBtn.click();

    await expect(page.getByRole('dialog', { name: 'Confirmar decisão' })).toBeVisible();

    const before =
      d1Json<{ c: number }>('SELECT COUNT(*) AS c FROM adaptation_decisions;')[0]?.c ?? 0;
    let postCount = 0;
    await page.route('**/api/v1/adaptation/decisions', async (route) => {
      if (route.request().method() === 'POST') {
        postCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      await route.continue();
    });

    const dialog = page.getByRole('dialog', { name: 'Confirmar decisão' });
    const confirm = dialog.getByRole('button', { name: 'Confirmar' });
    await expect(confirm).toBeEnabled();

    // Duplo clique rápido: segundo clique deve ser ignorado porque botão fica disabled.
    await confirm.click();
    await expect(dialog.getByRole('button', { name: 'Registrando…' })).toBeDisabled();
    await dialog
      .getByRole('button', { name: 'Registrando…' })
      .click({ force: true })
      .catch(() => undefined);

    // Espera conclusão do request atrasado.
    await expect(page.getByRole('dialog', { name: 'Confirmar decisão' })).toBeHidden({
      timeout: 20_000,
    });

    expect(postCount).toBe(1);
    const after =
      d1Json<{ c: number }>('SELECT COUNT(*) AS c FROM adaptation_decisions;')[0]?.c ?? 0;
    expect(Number(after) - Number(before)).toBe(1);

    // Estado coerente: histórico/propostas recarregados sem duplicação visível de erro.
    await page.getByRole('tab', { name: 'Histórico' }).click();
    await expect(page.getByText(/Decidido em/).first()).toBeVisible({ timeout: 20_000 });
  });
});
