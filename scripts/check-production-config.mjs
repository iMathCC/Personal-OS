#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRenderedConfig, readText } from './lib/config-validation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(root, process.argv[2] ?? 'apps/api/wrangler.production.toml');

if (!existsSync(configPath)) {
  console.error(`Config não encontrada: ${configPath}`);
  console.error('Execute `npm run deploy:prepare` com RP_ID, ORIGIN e D1_DATABASE_ID no ambiente.');
  process.exit(1);
}

const { errors, warnings } = checkRenderedConfig(readText(configPath));

const dist = resolve(root, 'apps/web/dist');
for (const asset of ['index.html', '_headers', 'sw.js', 'manifest.webmanifest']) {
  if (!existsSync(resolve(dist, asset))) errors.push(`Build ausente: apps/web/dist/${asset}`);
}

const configText = readText(configPath);
if (!/^preview_urls\s*=\s*false\s*$/m.test(configText)) {
  errors.push('Preview URLs não desativadas (preview_urls = false).');
}
if (existsSync(resolve(dist, '_headers'))) {
  const headersText = readFileSync(resolve(dist, '_headers'), 'utf8');
  if (!/Strict-Transport-Security:\s*max-age=15552000;\s*includeSubDomains/.test(headersText)) {
    errors.push('HSTS ausente ou com política diferente em apps/web/dist/_headers.');
  }
}

for (const warning of warnings) console.warn(`AVISO: ${warning}`);
if (errors.length > 0) {
  console.error('Validação de deploy falhou:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`Config validada: ${configPath}`);
console.log('Assets, bindings, segredos declarados e observabilidade conferidos.');
console.log('Secrets ainda devem ser conferidos no Worker remoto antes do tráfego real.');
