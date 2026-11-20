import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.local.toml' },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
  },
});
