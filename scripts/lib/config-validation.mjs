import { readFileSync } from 'node:fs';

export const PRODUCTION_SECRETS = ['SETUP_TOKEN', 'CSRF_SECRET', 'IP_HASH_SALT'];

export const PLACEHOLDERS = {
  RP_ID: 'REPLACE_WITH_RP_ID',
  ORIGIN: 'REPLACE_WITH_ORIGIN',
  D1_DATABASE_ID: 'REPLACE_WITH_D1_DATABASE_ID',
};

const UUID_V4_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HOSTNAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;

export function readText(path) {
  return readFileSync(path, 'utf8');
}

/** Validação rígida: um erro aqui impediria cadastro de passkey em produção. */
export function validatePublicConfig({ rpId, origin, databaseId }) {
  const errors = [];

  if (typeof rpId !== 'string' || !HOSTNAME.test(rpId) || rpId.length > 253) {
    errors.push('RP_ID deve ser um hostname válido, sem esquema, porta ou caminho.');
  } else {
    if (!rpId.includes('.')) errors.push('RP_ID deve ser um domínio registrável (contém ".").');
    if (rpId.startsWith('localhost') || rpId.endsWith('.local')) {
      errors.push('RP_ID local não é aceito na configuração de produção.');
    }
  }

  let parsedOrigin = null;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    errors.push('ORIGIN deve ser uma URL absoluta.');
  }
  if (parsedOrigin !== null) {
    if (parsedOrigin.protocol !== 'https:') errors.push('ORIGIN deve usar HTTPS.');
    if (parsedOrigin.host !== rpId) errors.push('ORIGIN deve ter o mesmo host do RP_ID.');
    if (parsedOrigin.pathname !== '/' || parsedOrigin.search !== '' || parsedOrigin.hash !== '') {
      errors.push('ORIGIN não deve conter caminho, query ou fragmento.');
    }
    if (parsedOrigin.username !== '' || parsedOrigin.password !== '') {
      errors.push('ORIGIN não deve conter credenciais.');
    }
  }

  if (typeof databaseId !== 'string' || !UUID_V4_LIKE.test(databaseId)) {
    errors.push('D1_DATABASE_ID deve ser um UUID válido retornado por `wrangler d1 create`.');
  } else if (/^0+$/.test(databaseId.replaceAll('-', ''))) {
    errors.push('D1_DATABASE_ID não pode ser o UUID reservado de desenvolvimento.');
  }

  return errors;
}

/** Substitui apenas os placeholders conhecidos e falha se algum reste. */
export function renderProductionTemplate(template, values) {
  let rendered = template;
  for (const [key, placeholder] of Object.entries(PLACEHOLDERS)) {
    const value = values[key];
    if (typeof value !== 'string' || value.trim() === '' || value.includes(placeholder)) {
      throw new Error(`Valor ausente ou inválido para ${key}.`);
    }
    rendered = rendered.replaceAll(placeholder, value);
  }
  return rendered;
}

/** Conferências que protegem contra uma configuração de produção insegura. */
export function checkRenderedConfig(text) {
  const errors = [];
  const warnings = [];

  for (const [key, placeholder] of Object.entries(PLACEHOLDERS)) {
    if (text.includes(placeholder)) errors.push(`${key} ainda contém placeholder.`);
  }
  for (const secret of PRODUCTION_SECRETS) {
    const varLine = new RegExp(`^\\s*${secret}\\s*=`, 'm');
    if (varLine.test(text)) {
      errors.push(`${secret} não pode ser definido em [vars]; use \`wrangler secret put\`.`);
    }
  }
  if (/\[\[d1_databases\]\][\s\S]*?binding\s*=\s*"DB_TEST"/.test(text)) {
    errors.push('Binding DB_TEST (destrutivo) não pode existir em produção.');
  }
  if (!/binding\s*=\s*"DB"/.test(text)) errors.push('Binding D1 "DB" ausente.');
  if (!/database_name\s*=\s*"personal-os"/.test(text)) {
    errors.push('Nome do banco D1 diferente do esperado ("personal-os").');
  }
  if (!/migrations_dir\s*=\s*"migrations"/.test(text)) {
    errors.push('migrations_dir ausente ou incorreto.');
  }
  if (!/not_found_handling\s*=\s*"single-page-application"/.test(text)) {
    errors.push('Fallback SPA de assets não configurado.');
  }
  if (!/run_worker_first\s*=\s*\["\/api\/\*"\]/.test(text)) {
    errors.push('Rotas /api/* não estão priorizadas para o Worker.');
  }
  if (!/directory\s*=\s*"\.\.\/web\/dist"/.test(text)) {
    errors.push('Diretório de assets não aponta para ../web/dist.');
  }
  if (!/\[secrets\]/.test(text) || !/required\s*=/.test(text)) {
    errors.push('[secrets].required não declarado.');
  } else {
    for (const secret of PRODUCTION_SECRETS) {
      if (!text.includes(`"${secret}"`))
        errors.push(`Secreto obrigatório ${secret} não declarado.`);
    }
  }
  if (!/redact_query_string\s*=\s*true/.test(text)) {
    errors.push('Observabilidade sem redact_query_string = true.');
  }
  if (!/invocation_logs\s*=\s*false/.test(text)) {
    warnings.push('invocation_logs não foi desligado; pode duplicar eventos de log.');
  }
  if (/head_sampling_rate\s*=\s*1(?:\.0)?/.test(text) === false) {
    warnings.push('Verifique a taxa de amostragem de logs.');
  }

  return { errors, warnings };
}
