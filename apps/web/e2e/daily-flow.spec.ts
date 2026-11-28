import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const SETUP_TOKEN = 'browser-setup-token';
const BROWSER_ENV_DIR = '/tmp/opencode/d36-browser-env';

const AUTHENTICATOR_OPTIONS = {
  protocol: 'ctap2',
  transport: 'internal',
  hasResidentKey: true,
  hasUserVerification: true,
  isUserVerified: true,
  automaticPresenceSimulation: true,
};

function resetIsolatedEnv(): void {
  const script = `
import { DatabaseSync } from 'node:sqlite';
import { execFileSync, spawn } from 'node:child_process';
import { readdirSync, readFileSync, existsSync, openSync } from 'node:fs';
import { join } from 'node:path';
const PORT = '87' + '89';
const envDir = '/tmp/opencode/d36-browser-env';
const wranglerBin = '/home/matheus/Projects/personal-OS/node_modules/wrangler/bin/wrangler.js';
const config = join(envDir, 'wrangler.browser.toml');
const persist = join(envDir, '.wrangler/state');
try { const pat=['wran','gler.*',PORT].join(''); const pids=execFileSync('pgrep',['-f',pat],{encoding:'utf8'}).split(/\\s+/).filter(Boolean); for(const pid of pids){ const n=Number(pid); if(n && n!==process.pid) try{process.kill(n,'SIGTERM')}catch{} } } catch {}
await new Promise((r) => setTimeout(r, 800));
const dir = join(envDir, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
if (existsSync(dir)) {
  const dbFile = readdirSync(dir).find((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
  if (dbFile) {
    const db = new DatabaseSync(join(dir, dbFile));
    db.exec('PRAGMA foreign_keys=OFF');
    const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name NOT LIKE 'sqlite_%'").all();
    for (const tr of triggers) db.exec('DROP TRIGGER IF EXISTS "' + String(tr.name).replace(/"/g,'""') + '"');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations'").all();
    for (const t of tables) db.exec('DELETE FROM "' + String(t.name).replace(/"/g,'""') + '"');
    const seed = readFileSync('/home/matheus/Projects/personal-OS/packages/db/src/seed.sql', 'utf8');
    db.exec(seed);
    db.exec('PRAGMA foreign_keys=ON');
    db.close();
  }
}
const out = openSync('/tmp/opencode/d36-browser-dev3.log', 'a');
const child = spawn(process.execPath, [wranglerBin, 'dev', '--config', config, '--port', PORT, '--local', '--local-protocol', 'https', '--https-key-path', join(envDir,'localhost.key'), '--https-cert-path', join(envDir,'localhost.crt'), '--persist-to', persist], {
  cwd: envDir, detached: true, stdio: ['ignore', out, out], env: { ...process.env }
});
child.unref();
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch('https://localhost:' + PORT + '/api/v1/health', { signal: AbortSignal.timeout(2000) });
    if (r.ok) process.exit(0);
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
console.error('D36 server not ready');
process.exit(1);
`;
  const file = '/tmp/opencode/d36-reset.mjs';
  writeFileSync(file, script);
  execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: BROWSER_ENV_DIR,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 120_000,
    env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' },
  });
}

async function enableVirtualAuthenticator(context: BrowserContext, page: Page): Promise<void> {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const result = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: AUTHENTICATOR_OPTIONS,
  });
  if (
    typeof result !== 'object' ||
    result === null ||
    !('authenticatorId' in result) ||
    typeof (result as { authenticatorId?: unknown }).authenticatorId !== 'string'
  ) {
    throw new Error('CDP não retornou authenticatorId.');
  }
}

test.describe('D36 fluxo diário (ambiente isolado)', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'CDP virtual authenticator só no Chromium.',
  );
  test.skip(
    () => process.env.PLAYWRIGHT_BASE_URL !== 'https://localhost:8789',
    'Roda apenas no browser-env isolado D36 (PLAYWRIGHT_BASE_URL=https://localhost:8789).',
  );

  test('fluxo diário completo com persistência local de reflexão', async ({ page, context }) => {
    test.setTimeout(180_000);
    resetIsolatedEnv();
    await enableVirtualAuthenticator(context, page);

    await page.goto('/');
    await page.getByRole('button', { name: 'Primeiro acesso' }).click();
    await expect(page.getByRole('heading', { name: 'Criar conta' })).toBeVisible();
    const setupToken = page.getByLabel('Token de setup');
    await expect(setupToken).toBeVisible();
    await setupToken.fill(SETUP_TOKEN);
    await page.getByLabel('Nome de exibição').fill('D36 Usuario');
    await page.getByLabel('Fuso horário').fill('America/Sao_Paulo');
    await page.getByLabel('Nome da passkey').fill('Passkey D36');
    await page.getByRole('button', { name: 'Criar passkey' }).click();
    await expect(page.getByRole('heading', { name: 'Guarde seus códigos' })).toBeVisible();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByRole('button', { name: 'Encerrar sessão' })).toBeVisible();

    await page.goto('/hoje');
    await expect(page.getByRole('heading', { name: /Bom dia|Boa tarde|Boa noite/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Próxima ação recomendada' })).toBeVisible();

    const taskForm = page.getByRole('form', { name: 'Registrar tarefa rápida' });
    await taskForm.getByLabel('Título da tarefa').fill('Tarefa D36 concluir');
    await taskForm.getByRole('button', { name: 'Registrar tarefa' }).click();
    await expect(page.getByText('Tarefa registrada com a data local da conta.')).toBeVisible();

    const nextAction = page.getByRole('region', { name: 'Próxima ação recomendada' });

    await page.goto('/hoje');
    await expect(nextAction.getByText('Tarefa D36 concluir')).toBeVisible();
    await nextAction.getByRole('button', { name: 'Iniciar' }).click();
    await expect(page.getByText('Tarefa iniciada. O status foi atualizado.')).toBeVisible();

    await page.goto('/hoje');
    await expect(nextAction.getByText('Tarefa D36 concluir')).toBeVisible();
    await nextAction.getByRole('button', { name: 'Concluir' }).click();
    await expect(
      page.getByText('Tarefa concluída. Os indicadores foram atualizados.'),
    ).toBeVisible();

    await page.goto('/hoje');
    await taskForm.getByLabel('Título da tarefa').fill('Tarefa D36 adiar');
    await taskForm.getByRole('button', { name: 'Registrar tarefa' }).click();
    await expect(page.getByText('Tarefa registrada com a data local da conta.')).toBeVisible();

    await page.goto('/hoje');
    await expect(nextAction.getByText('Tarefa D36 adiar')).toBeVisible();
    await nextAction.getByRole('button', { name: 'Adiar 1 dia' }).click();
    await expect(page.getByText(/Tarefa adiada para/)).toBeVisible();

    const studyForm = page.getByRole('form', { name: 'Registrar sessão de estudo' });
    await studyForm.getByLabel('Tópico estudado').fill('Estudo D36');
    await studyForm.getByLabel('Duração em minutos').fill('25');
    await studyForm.getByRole('button', { name: 'Registrar estudo' }).click();
    await expect(page.getByText('Sessão de estudo registrada no fuso da conta.')).toBeVisible();

    await page.goto('/revisao-diaria');
    await expect(page.locator('#daily-review-title')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Planejado ou relevante hoje' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Executado' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pendente / transferir' })).toBeVisible();
    await expect(page.getByText(/Tarefa D36 concluir/)).toBeVisible();

    const reflection = page.getByLabel('O que aprendi ou quero ajustar? (opcional)');
    await reflection.fill('Reflexão D36 local');
    await page.getByRole('button', { name: 'Salvar rascunho local' }).click();
    await expect(page.getByText(/rascunho local salvo/)).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('O que aprendi ou quero ajustar? (opcional)')).toHaveValue(
      'Reflexão D36 local',
    );
  });
});
