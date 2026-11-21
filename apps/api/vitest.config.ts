import { existsSync } from 'node:fs';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// A config local com valores dummy não é versionada; em clone limpo usamos o exemplo.
const localConfigPath = './wrangler.local.toml';
const configPath = existsSync(localConfigPath) ? localConfigPath : './wrangler.local.example.toml';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
  },
});
