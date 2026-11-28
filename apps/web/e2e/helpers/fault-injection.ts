import type { Page, Route } from '@playwright/test';

export interface FaultInjectionOptions {
  status?: number;
  body?: unknown;
  delayMs?: number;
  abort?: 'timedout' | 'failed' | 'connectionrefused';
  contentType?: string;
}

export async function injectApiFault(
  page: Page,
  urlPattern: string | RegExp,
  options: FaultInjectionOptions,
): Promise<void> {
  await page.route(urlPattern, async (route: Route) => {
    if (options.delayMs && options.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }
    if (options.abort) {
      await route.abort(options.abort);
      return;
    }
    await route.fulfill({
      status: options.status ?? 500,
      contentType: options.contentType ?? 'application/json',
      body: JSON.stringify(
        options.body ?? { error: { code: 'INTERNAL_ERROR', message: 'Injected fault' } },
      ),
    });
  });
}

export async function clearApiFault(page: Page, urlPattern: string | RegExp): Promise<void> {
  await page.unroute(urlPattern);
}
