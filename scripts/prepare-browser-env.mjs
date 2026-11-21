#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const envDir = '/tmp/opencode/browser-env';
const configPath = join(envDir, 'wrangler.browser.toml');
const wrangler = resolve(ROOT, 'node_modules/wrangler/bin/wrangler.js');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: 'inherit' });
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')} falhou (${result.status}).`);
}

mkdirSync(envDir, { recursive: true });

if (process.argv.includes('--reset')) {
  const stateDir = join(envDir, '.wrangler');
  if (existsSync(stateDir)) rmSync(stateDir, { recursive: true, force: true });
  console.log('Estado D1 local descartado (ambiente isolado).');
}

let config = readFileSync(resolve(ROOT, 'apps/api/wrangler.local.example.toml'), 'utf8');
const replacements = [
  [/RP_ID = "[^"]+"/, 'RP_ID = "localhost"'],
  [/ORIGIN = "[^"]+"/, 'ORIGIN = "https://localhost:8788"'],
  [/SETUP_TOKEN = "[^"]+"/, 'SETUP_TOKEN = "browser-setup-token"'],
  [/CSRF_SECRET = "[^"]+"/, 'CSRF_SECRET = "browser-csrf-secret-not-for-production"'],
  [/IP_HASH_SALT = "[^"]+"/, 'IP_HASH_SALT = "browser-ip-salt-not-for-production"'],
];
for (const [pattern, value] of replacements) {
  if (!pattern.test(config)) throw new Error(`Padrão não encontrado na config local: ${pattern}`);
  config = config.replace(pattern, value);
}
writeFileSync(configPath, config);

for (const [target, link] of [
  [resolve(ROOT, 'apps/api/src'), join(envDir, 'src')],
  [resolve(ROOT, 'apps/api/migrations'), join(envDir, 'migrations')],
  [resolve(ROOT, 'apps/web'), '/tmp/opencode/web'],
]) {
  if (!existsSync(link)) symlinkSync(target, link);
}

if (!existsSync(join(envDir, 'localhost.key')) || !existsSync(join(envDir, 'localhost.crt'))) {
  run('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '2',
    '-keyout',
    join(envDir, 'localhost.key'),
    '-out',
    join(envDir, 'localhost.crt'),
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=DNS:localhost',
  ]);
}

run(
  process.execPath,
  [wrangler, 'd1', 'migrations', 'apply', 'DB', '--local', '--force', '--config', configPath],
  envDir,
);
run(
  process.execPath,
  [
    wrangler,
    'd1',
    'execute',
    'DB',
    '--local',
    '--yes',
    '--config',
    configPath,
    '--file',
    resolve(ROOT, 'packages/db/src/seed.sql'),
  ],
  envDir,
);

console.log(`Ambiente de navegador preparado em ${envDir}`);
console.log('Inicie o servidor com:');
console.log(
  `cd ${envDir} && node ${wrangler} dev --config ${configPath} --port 8788 --local --local-protocol https --https-key-path ${join(envDir, 'localhost.key')} --https-cert-path ${join(envDir, 'localhost.crt')}`,
);
