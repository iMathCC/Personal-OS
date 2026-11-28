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
const PORT = '8789';
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
const out = openSync('/tmp/opencode/d37-browser-dev.log', 'a');
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
console.error('D37 server not ready');
process.exit(1);
`;
  writeFileSync('/tmp/opencode/d37-reset.mjs', script);
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
  if (typeof result !== 'object' || result === null || !('authenticatorId' in result)) {
    throw new Error('CDP não retornou authenticatorId.');
  }
}

test.describe('D37 observações pessoais (ambiente isolado)', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'CDP virtual authenticator só no Chromium.',
  );
  test.skip(
    () => process.env.PLAYWRIGHT_BASE_URL !== 'https://localhost:8789',
    'Roda apenas no browser-env isolado 8789.',
  );

  test('registra, consulta, corrige, persiste e mostra inferência/lacunas', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    resetIsolatedEnv();
    await enableVirtualAuthenticator(context, page);

    await page.goto('/');
    await page.getByRole('button', { name: 'Primeiro acesso' }).click();
    await expect(page.getByRole('heading', { name: 'Criar conta' })).toBeVisible();
    await page.getByLabel('Token de setup').fill(SETUP_TOKEN);
    await page.getByLabel('Nome de exibição').fill('D37 Usuario');
    await page.getByLabel('Fuso horário').fill('America/Sao_Paulo');
    await page.getByLabel('Nome da passkey').fill('Passkey D37');
    await page.getByRole('button', { name: 'Criar passkey' }).click();
    await expect(page.getByRole('heading', { name: 'Guarde seus códigos' })).toBeVisible();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Continuar' }).click();

    await page.goto('/observacoes');
    await expect(
      page.getByRole('heading', { name: 'Registrar fatos, resultados e inferências' }),
    ).toBeVisible();

    // Registrar observação executada
    await page.getByLabel('Tipo de observação').selectOption('executed');
    await page.getByLabel('Título').fill('Sessão de foco');
    await page.getByLabel('Data local').fill('2026-11-10');
    await page.getByLabel('Hora local').fill('09:00');
    await page.getByLabel('Valor numérico (opcional)').fill('45');
    await page.getByLabel('Unidade (opcional)').fill('min');
    await page.getByRole('button', { name: 'Registrar observação' }).click();
    await expect(page.getByText('Observação registrada com proveniência')).toBeVisible();
    await page.getByLabel('De', { exact: true }).fill('2026-11-10');
    await page.getByLabel('Até', { exact: true }).fill('2026-11-27');
    await page.getByRole('button', { name: 'Atualizar' }).click();
    await expect(page.getByText('Sessão de foco')).toBeVisible();

    // Registrar inferência (deve exigir confidence)
    await page.getByLabel('Tipo de observação').selectOption('inference');
    await page.getByLabel('Título').fill('Possível melhora de foco');
    await page.getByLabel('Data local').fill('2026-11-11');
    await page.getByLabel('Hora local').fill('10:00');
    await page.getByLabel('Confidence 0-1 (obrigatório para inferência)').fill('0.6');
    await page.getByRole('button', { name: 'Registrar observação' }).click();
    await expect(page.getByText('Possível melhora de foco')).toBeVisible();
    await expect(page.getByText(/inferência/i).first()).toBeVisible();

    // Corrigir observação
    await page.getByRole('button', { name: 'Corrigir' }).first().click();
    await page.getByLabel('Título').fill('Sessão de foco corrigida');
    await page.getByRole('button', { name: 'Salvar correção' }).click();
    await expect(page.getByText('Sessão de foco corrigida')).toBeVisible();

    // Persistência após reload
    await page.reload();
    await page.getByLabel('De', { exact: true }).fill('2026-11-10');
    await page.getByLabel('Até', { exact: true }).fill('2026-11-27');
    await page.getByRole('button', { name: 'Atualizar' }).click();
    await expect(page.getByText('Sessão de foco corrigida')).toBeVisible();
    await expect(page.getByText('Possível melhora de foco')).toBeVisible();

    // Indicadores: sem zero fictício / limitações
    await page.getByLabel('De', { exact: true }).fill('2026-11-10');
    await page.getByLabel('Até', { exact: true }).fill('2026-11-12');
    await page.getByRole('button', { name: 'Atualizar' }).click();
    await expect(page.getByText(/zero fictício/i)).toBeVisible();
    await expect(page.getByText(/Ausência explícita/i)).toBeVisible();
  });
});
