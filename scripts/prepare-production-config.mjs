#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readText,
  renderProductionTemplate,
  validatePublicConfig,
} from './lib/config-validation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = resolve(root, 'apps/api/wrangler.toml');
const outputPath = resolve(root, 'apps/api/wrangler.production.toml');

const values = {
  RP_ID: process.env.RP_ID?.trim() ?? '',
  ORIGIN: process.env.ORIGIN?.trim() ?? '',
  D1_DATABASE_ID: process.env.D1_DATABASE_ID?.trim() ?? '',
};

const errors = validatePublicConfig({
  rpId: values.RP_ID,
  origin: values.ORIGIN,
  databaseId: values.D1_DATABASE_ID,
});
if (errors.length > 0) {
  console.error('Configuração de produção inválida:');
  for (const error of errors) console.error(`  - ${error}`);
  console.error('\nVariáveis esperadas: RP_ID, ORIGIN (URL https completa), D1_DATABASE_ID.');
  process.exit(1);
}

const rendered = renderProductionTemplate(readText(templatePath), values);
writeFileSync(outputPath, rendered, { mode: 0o600 });

console.log(`Configuração gerada: ${outputPath}`);
console.log(`RP_ID: ${values.RP_ID}`);
console.log(`ORIGIN: ${values.ORIGIN}`);
console.log(`D1_DATABASE_ID: ${values.D1_DATABASE_ID}`);
console.log('\nAntes de publicar, defina os segredos (valores NUNCA no Git):');
for (const secret of ['SETUP_TOKEN', 'CSRF_SECRET', 'IP_HASH_SALT']) {
  console.log(`  npx wrangler secret put ${secret} --config apps/api/wrangler.production.toml`);
}
