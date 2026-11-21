import { expect, test, type Page } from '@playwright/test';

async function activateServiceWorker(page: Page): Promise<void> {
  await page.goto('/');
  // waitForFunction não aguarda Promises retornadas pela callback: usar evaluate
  // com polling explícito evita recarregar antes de o SW estar de fato ativo.
  await page.evaluate(async () => {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.active?.state === 'activated') return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Service worker não ativou.');
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

test('deep links e fallback SPA servem a aplicação', async ({ page }) => {
  for (const path of ['/estudos', '/configuracoes', '/rota-inexistente']) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
  }
});

test('headers de segurança e no-store', async ({ page }) => {
  const html = await page.request.get('/');
  expect(html.headers()['content-type']).toContain('text/html');
  expect(html.headers()['cache-control']).toContain('no-store');
  expect(html.headers()['x-content-type-options']).toBe('nosniff');
  expect(html.headers()['referrer-policy']).toBe('no-referrer');
  expect(html.headers()['content-security-policy']).toContain("default-src 'self'");

  const api = await page.request.get('/api/v1/health');
  expect(api.status()).toBe(200);
  expect(api.headers()['cache-control']).toContain('no-store');
  expect(api.headers()['x-request-id']).toMatch(/^req_/);
});

test('manifest e ícones da PWA', async ({ page }) => {
  const response = await page.request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);
  const manifest = (await response.json()) as {
    name: string;
    display: string;
    icons: Array<{ src: string; sizes: string }>;
  };
  expect(manifest.name).toBe('Personal OS');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(['192x192', '512x512', '512x512']);

  for (const icon of manifest.icons) {
    const asset = await page.request.get(icon.src);
    expect(asset.status()).toBe(200);
  }
});

test('service worker precarrega assets e não guarda respostas privadas', async ({ page }) => {
  await activateServiceWorker(page);
  const cacheNames = await page.evaluate(async () => await caches.keys());
  expect(cacheNames.some((name) => name.startsWith('workbox-precache-v2-'))).toBe(true);
  expect(cacheNames.some((name) => name.startsWith('api-get-v1'))).toBe(false);

  await page.goto('/api/v1/health');
  const privateCaches = await page.evaluate(async () => await caches.keys());
  expect(privateCaches.some((name) => name.startsWith('api-'))).toBe(false);
});

test('interface abre offline após precache', async ({ page, context }) => {
  await activateServiceWorker(page);
  await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  // Respostas de API nunca entram em cache (política de privacidade). O que
  // precisa funcionar offline é o shell da aplicação: ele renderiza a tela de
  // erro de conexão a partir dos assets precarregados, sem depender da rede.
  await expect(page.getByRole('heading', { name: 'Não foi possível iniciar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  await context.setOffline(false);
});

test('acessibilidade básica e responsividade de 360 a 1920 px', async ({ page }) => {
  for (const width of [360, 768, 1920]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    const unnamed = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll('button')).filter((button) => {
          const label = button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '';
          return label.length === 0;
        }).length,
    );
    expect(unnamed).toBe(0);

    const smallTargets = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll('button'))
          .filter((button) => button.getBoundingClientRect().height > 0)
          .filter((button) => button.getBoundingClientRect().height < 44).length,
    );
    expect(smallTargets).toBe(0);
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const firstControl = page.getByRole('button', { name: 'Entrar com passkey' });
  await expect(firstControl).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(firstControl).toBeFocused();
});
