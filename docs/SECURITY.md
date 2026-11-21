# Segurança — Personal OS

- **Versão:** 1.0 (Fase 0)
- **Data:** 2026-11-20
- **Status:** Proposta para aprovação
- **Escopo:** aplicação, API, dados, autenticação, backups, IA e cadeia de suprimentos

O Personal OS armazena dados financeiros e de saúde de um único usuário e é exposto na internet. Segurança não é opcional. Este documento define requisitos mínimos; a implementação deve comprová-los com testes e checklist de PR.

---

## 1. Modelo de ameaças (resumo)

### 1.1 Ativos

| Ativo | Sensibilidade |
| --- | --- |
| Transações e saldos | Alta |
| Registros de saúde, humor, sono, peso | Alta |
| Objetivos, notas, reflexões | Média/Alta |
| Credenciais de passkey e códigos de recuperação | Crítica |
| Sessões e tokens | Crítica |
| Backups/exportações | Crítica |
| Chave de IA (BYOK), se usada | Crítica |
| Segredos de deploy (Cloudflare/GitHub) | Crítica |

### 1.2 Atores e superfícies

- Usuário legítimo (desktop/celular, redes não confiáveis).
- Atacante anônimo na internet (varredura, força bruta, abuso de cota).
- Atacante com posse de um dispositivo/sessão.
- Serviço externo opcional de IA.
- Dependência comprometida (npm/action).
- Provedor de nuvem (Cloudflare) — confiança operacional.

### 1.3 Ameaças e mitigações

| Ameaça | Vetor | Mitigação |
| --- | --- | --- |
| Phishing/roubo de senha | Login | Passkeys resistentes a phishing; sem senha reutilizável |
| Força bruta | Endpoints de auth | Rate limit por IP + desafio de uso único + passkeys |
| Sequestro de sessão | XSS, dispositivo perdido | Cookie HttpOnly/Secure/SameSite; CSP; revogação; expiração |
| CSRF | Formulários cross-site | SameSite=Lax + validação de `Origin` + token CSRF |
| XSS | Notas, títulos, Markdown, URLs | Escapar por padrão; sanitizar Markdown; CSP; allowlist de URLs |
| Injeção SQL | Filtros/ordenação | Drizzle parametrizado; nunca concatenar SQL; allowlist de ordenação |
| IDOR | IDs em rotas | Single-tenant + verificação de existência; sem confiar em IDs do cliente |
| Exfiltração via IA | Envio de dados a LLM | Desabilitado por padrão; consentimento; redaction; escopo mínimo |
| Vazamento em logs | Console/erros | Nunca logar tokens, cookies, notas ou valores financeiros |
| Vazamento de backup | R2/arquivo local | Bucket privado, URLs assinadas curtas, retenção, criptografia opcional |
| Abuso de cota/custo | Requisições em massa | Rate limit, body limit, auth obrigatória, monitoramento |
| Supply chain | npm/GitHub Actions | Lockfile, versões fixas, `npm audit`, Actions pinadas por SHA, revisão |
| Compromisso da conta Cloudflare | Painel | 2FA, token de API com escopo mínimo, secrets separados |
| Perda de dados | Falha/erro humano | Backups + Time Travel + teste de restauração |
| Enumeração de usuário | Auth | Single-user; respostas genéricas; sem cadastro público |

### 1.4 Fora do escopo (risco residual documentado)

- **E2EE:** o provedor (Cloudflare) tecnicamente acessa dados em repouso. Mitigação futura: criptografia no cliente para dados ultra-sensíveis (não na v1).
- **Multiusuário/RBAC:** não existe.
- **Certificações (SOC2 etc.):** não aplicável.
- **Proteção contra admin comprometido:** se a conta Cloudflare for comprometida, os dados podem ser acessados. Mitigação: 2FA, tokens escopados, monitoramento de deploy.
- **Ataques de canal lateral no runtime compartilhado:** mitigado pelo modelo de isolates da Cloudflare; fora do controle do app.

---

## 2. Autenticação

### 2.1 Decisão

**Passkeys (WebAuthn) como método primário**, com códigos de recuperação de uso único. Sem senha.

Justificativa:

- Resistente a phishing e credential stuffing.
- Verificação ECDSA (P-256) cabe no orçamento de 10 ms de CPU do free tier, ao contrário de PBKDF2/Argon2 com iterações seguras.
- WebCrypto disponível no Workers; `@simplewebauthn/server` suporta Workers (validar com benchmark na Fase 1).

### 2.2 Requisitos

- RP ID e Origin configurados por ambiente (`RP_ID`, `ORIGIN`), nunca derivados de header.
- Desafio aleatório ≥ 16 bytes, armazenado com TTL de 10 min, uso único.
- Verificar `type`, `challenge`, `origin`, `rpIdHash`, flags (`UP` e `UV` exigidos), assinatura e contador. Exceções do `@simplewebauthn/server` (origin/RP ID/UP/UV/assinatura inválidos) são convertidas para `401 UNAUTHENTICATED`; nunca vazam como 500.
- Contador zero ou crescente é aceito. Contador igual ou regressivo é **anomalia auditada** (`counter_anomaly`), preservando o último valor confiável em vez de rejeitar a autenticação legítima.
- Múltiplas passkeys permitidas (ex.: celular + chave física) para evitar lockout.
- Códigos de recuperação: 10 códigos de 128 bits, exibidos uma vez, armazenados como SHA-256, uso único; usar um invalida todas as sessões e exige nova passkey.
- Bootstrap: `SETUP_TOKEN` secreto e de alta entropia; endpoint desabilitado após `setup_completed_at`.
- Sem cadastro público; segundo usuário não pode ser criado.
- Log de eventos de auth em `audit_log` (sem token/chave).

### 2.3 Sessões

- Token de 256 bits gerado com `crypto.getRandomValues`; armazenado apenas como SHA-256.
- Cookie `__Host-pos_session`: `HttpOnly; Secure; SameSite=Lax; Path=/` (sem `Domain`), `Max-Age` de 90 dias.
- Expiração absoluta 90 dias; inatividade 30 dias; nova sessão em login/setup (recuperação não cria sessão).
- `last_seen_at` atualizado no máximo 1×/hora para reduzir escritas.
- Revogação individual e global; botão “sair de todos os dispositivos”.
- Limite de 10 sessões ativas; excedente revogado por LRU no mesmo `db.batch()` da criação, reforçado por guard SQL condicional.
- Sessão validada no D1 em toda requisição protegida; não é aceita se `revoked_at` ou `expires_at` no passado ou se excedeu inatividade.

### 2.4 CSRF

- `SameSite=Lax` reduz risco, mas não é suficiente para todos os casos.
- Toda mutação exige `Origin` presente e igual a uma allowlist explícita (`ORIGIN`/`ALLOWED_ORIGINS`); `Referer` **não** é usado como fallback.
- Token CSRF de 128 bits em cookie `pos_csrf` (não HttpOnly) + header `X-CSRF-Token`; comparação em tempo constante e verificação HMAC com `CSRF_SECRET`. O subject é o hash da sessão (`session:<hash>`) quando autenticado e `anon:<vid>` no pré-login, onde `pos_vid` é um cookie opaco de dispositivo.
- `GET /auth/csrf` emite o token anônimo; após setup/login/logout o subject muda e o cliente renova o token. O frontend guarda o token **apenas em memória** (nunca `localStorage`/`sessionStorage`).
- Requisições `GET/HEAD/OPTIONS` são isentas e não mudam estado.
- Mutações exigem `Content-Type: application/json`; qualquer outro valor é recusado com `403 FORBIDDEN`.

### 2.5 Rate limiting

| Endpoint | Limite | Janela / chave |
| --- | --- | --- |
| `POST /auth/login/options` | 30 req | 15 min por IP (hash) |
| `POST /auth/login/verify` | 10 req + 5 falhas | 15 min por IP (hash) |
| `POST /auth/setup/*` | 10 req + 5 falhas | 15 min por IP (hash) |
| `POST /auth/recovery/verify` | 5 req | 5 min por IP (hash) |
| `POST /auth/recovery/register/*` | 10 req | 5 min por IP (hash) |
| Leituras autenticadas | 600 req | 1 min por usuário |
| Escritas autenticadas | 300 req | 1 min por usuário |

Implementação em D1 (`rate_limits`), janela fixa com upsert atômico; contadores de falha usam a chave `failure:<prefix>:<id>` na mesma tabela. Respostas excedentes retornam `429` com `Retry-After`. **Falha fechada:** se o D1 não responder em qualquer etapa da verificação/gravação, a rota responde `503 DEPENDENCY_UNAVAILABLE` — inclusive leituras. Cloudflare fornece proteção DDoS de rede, mas não substitui limites de aplicação. Somente `CF-Connecting-IP` é confiável como IP do cliente; IP e UA são salvos como hash com salt (`IP_HASH_SALT`). Exportação/importação e limite global por IP ainda não implementados (Fases posteriores).

---

## 3. Autorização

- Single-tenant: toda requisição autenticada pertence ao único usuário.
- Ainda assim, validar existência e estado (`deleted_at`, `archived_at`) de cada recurso.
- Não confiar em `userId` enviado pelo cliente; não existe na API.
- Operações administrativas (`/usage`, `/admin/recompute`, purge) exigem sessão autenticada + confirmação explícita; não há papel admin separado na v1.
- Jobs internos não expõem HTTP; usam binding D1 diretamente no contexto do Worker.
- IA nunca recebe credenciais nem permissão de escrita.

---

## 4. Proteção contra XSS e conteúdo

- React escapa por padrão; **proibido** `dangerouslySetInnerHTML` sem sanitização.
- Markdown de notas: renderizar com sanitizador allowlist (ex.: `marked` + `DOMPurify` no cliente ou sanitização no servidor). Preferir renderização no cliente com DOMPurify; testar payloads.
- URLs: permitir apenas `https:`, `http:` (com aviso) e `mailto:`; bloquear `javascript:`, `data:` e `file:`.
- Imagens externas (capas de livros): `referrerpolicy="no-referrer"`, `loading="lazy"`, allowlist de domínios ou proxy; não renderizar SVG de terceiros.
- CSP (produção):

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';   # Radix/shadcn usam estilos inline; revisar
img-src 'self' data: https:;
font-src 'self';
connect-src 'self';
worker-src 'self';
manifest-src 'self';
frame-ancestors 'none';
base-uri 'none';
form-action 'self';
object-src 'none';
upgrade-insecure-requests;
```

- `style-src 'unsafe-inline'` é uma concessão; avaliar nonce/hash se viável. Nunca usar `unsafe-eval`.
- Headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` mínima, `Strict-Transport-Security`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`.
- `frame-ancestors 'none'` (sem embed).
- Service worker: apenas same-origin; limpar caches no logout; não cachear respostas com `Cache-Control: no-store`.

---

## 5. Validação e integridade

- Zod em **toda** entrada: body, query, params, headers relevantes.
- Limites de tamanho: corpo 256 KB (import 5 MB), strings, arrays (máx. 500 no bulk), profundidade de JSON.
- Rejeitar propriedades desconhecidas (`strict`) para evitar mass assignment.
- Saída serializada por DTO allowlist; nunca retornar linha crua do banco.
- Ordenação e filtros com allowlist de colunas; nunca interpolar nomes de coluna.
- Drizzle parametriza valores; SQL bruto só com revisão e `sql` template seguro.
- Regras de domínio validadas no serviço (não só no cliente).
- Concorrência otimista via `version`/`If-Match`.
- Idempotência em criação/importação para evitar duplicatas por retry.

### 5.1 Atomicidade em autenticação

- Mutação de auth e sua linha de `audit_log` são sempre enviadas no mesmo `db.batch()`; nunca há gravação sem auditoria.
- Uso único de challenge, código de recuperação e `recoveryToken` é garantido por `INSERT` de guard em `idempotency_keys` (chave primária) + `UPDATE ... WHERE consumed_at IS NULL` com verificação de `changes()`. Violação de `UNIQUE` é traduzida para `409 CONFLICT`, nunca 500.
- O limite de 10 sessões usa guard SQL condicional no mesmo batch da criação; revogações LRU e suas auditorias atômicas acompanham a nova sessão.
- Testes de concorrência cobrem challenge duplo, código duplo e 14 logins simultâneos, verificando no banco o consumo único, a contagem de sessões e a correspondência um-para-um com a auditoria.

---

## 6. Proteção de dados

### 6.1 Classificação

| Classe | Exemplos | Controles |
| --- | --- | --- |
| Crítica | Tokens, chaves, códigos de recuperação | Hash/segredo, nunca exportar, acesso mínimo |
| Sensível | Finanças, saúde, notas | Auth, TLS, logs redigidos, backup privado |
| Interna | Títulos, metas, projetos | Auth |
| Pública | Nome do app, health check | Nenhum dado pessoal |

### 6.2 Em repouso

- D1 e R2 usam criptografia gerenciada pela Cloudflare (AES-256 em repouso, conforme provedor).
- Sem E2EE na v1; risco residual documentado.
- Backups R2: bucket privado, sem acesso público, lifecycle de 8 semanas, URLs assinadas com expiração ≤ 5 min.
- Exportações locais: responsabilidade do usuário; UI avisa que o arquivo contém dados sensíveis.

### 6.3 Em trânsito

- HTTPS obrigatório; HSTS com `max-age` ≥ 6 meses; redirect HTTP→HTTPS.
- Sem conexões HTTP para serviços externos; apenas HTTPS com validação de certificado.
- IA: endpoint HTTPS, timeout, sem envio de headers/cookies.

### 6.4 Minimização e retenção

- Coletar apenas o necessário para as funcionalidades.
- `ip_hash` com salt (não armazenar IP puro) em sessões/auditoria.
- `user_agent` resumido/hash.
- Retenção conforme DATA_MODEL §9; purga mensal.
- Exportação não inclui tokens, sessões, challenges, rate limits ou segredos.
- Exclusão de conta: procedimento documentado (purge após confirmação + export obrigatório).

### 6.5 Logs

- Estruturados, com request ID, rota, status, duração, contagem de linhas D1.
- **Nunca** logar: cookies, Authorization, corpos de auth, notas, valores de transações, conteúdo de saúde, chaves de IA.
- Erros internos: logar apenas `level`, `message`, `requestId` e `errorName`; **sem stack trace**, SQL ou corpo da requisição. Resposta ao cliente é sempre `{ error: { code: 'INTERNAL_ERROR', message: 'Erro interno.', requestId } }`.
- Retenção de logs do provedor: 3 dias (free). Não depender deles para auditoria.

---

## 7. Segredos e configuração

- Segredos nunca no repositório: `.dev.vars`, `.env*` no `.gitignore`.
- Produção: `wrangler secret put` (`SETUP_TOKEN`, `CSRF_SECRET`, `IP_HASH_SALT`, `AI_API_KEY` opcional, `R2_*`). `wrangler.local.toml` contém apenas valores dummy para desenvolvimento; nunca segredos reais.
- CI: GitHub Actions Secrets; token Cloudflare com escopo mínimo (Workers Scripts:Edit, D1:Edit, R2:Edit somente se backup).
- Rotação: setup token após bootstrap; chave de IA ao menor sinal de exposição; token Cloudflare a cada 90 dias ou em incidente.
- Separar credenciais por ambiente; nunca reutilizar token pessoal em CI.
- 2FA obrigatório na conta Cloudflare e GitHub.
- Ações do GitHub pinadas por SHA (não `@main`/`@v1`).
- `npm ci` com lockfile; `npm audit` no CI (falha em high/critical); Dependabot habilitado.
- Revisar dependências novas; justificar no PR (ver AGENTS.md).

---

## 8. Segurança de IA (opcional)

- Desabilitada por padrão; requer consentimento explícito e chave do usuário (BYOK).
- Enviar apenas o recorte necessário: métricas agregadas e textos selecionados; nunca o banco inteiro, transações brutas ou credenciais.
- Redaction de nomes, contas, valores absolutos quando não indispensáveis.
- Não enviar dados de saúde/finanças sem confirmação por chamada ou configuração explícita.
- Timeout (ex.: 20 s), limite de tokens, retry limitado, sem streaming de dados sensíveis para logs.
- Registrar provedor, modelo, versão de prompt e hash do input; não armazenar a resposta bruta se contiver PII desnecessária.
- Respostas do LLM são tratadas como **não confiáveis**: renderizar como texto sanitizado, nunca executar instruções.
- Prompt injection: separar instruções de dados; não permitir que conteúdo do usuário altere ferramentas/permissões; sem tool calling que escreva dados na v1.
- Falha da IA não bloqueia o app; UI mostra estado e permite continuar.

---

## 9. Backups, exportação e continuidade

- D1 Time Travel (7 dias no free) é recuperação operacional, **não** backup do usuário.
- Export completo sob demanda; lembrete mensal na UI se o último export > 30 dias.
- Backup automático semanal para R2 privado (se habilitado) + retenção de 8 semanas.
- Teste de restauração trimestral em ambiente local; registrar resultado em `docs/operations/restore-drill.md` (a criar na Fase 1).
- Exportação inclui checksum; importação valida antes de aplicar.
- RTO/RPO informais: RPO ≤ 7 dias (backup semanal) ou ≤ 24 h se export diário manual; RTO ≤ 1 h (recriar Worker + importar).
- Plano de saída: exportar JSON/CSV, `wrangler d1 export`, migrar domínio/Worker; sem dependência de formato proprietário.

---

## 10. Segurança do frontend

- Sem chaves/segredos no bundle (apenas `VITE_*` públicos; nenhum segredo).
- `VITE_*` é público por definição; nunca usar para credenciais.
- Dependências de UI revisadas; shadcn copiado e auditável.
- Links externos: `rel="noopener noreferrer"`.
- Downloads de exportação: `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`.
- Formulários: autocomplete adequado; token CSRF e dados de sessão ficam apenas em memória — **proibido** `localStorage`/`sessionStorage` para credenciais.
- Cache do service worker limpo no logout; `/api/v1/auth/*` nunca é cacheado; caches privados (`api-get-v1*`, `private-*`) são removidos ao encerrar a sessão.
- Aviso de sessão expirada e redirecionamento seguro (sem open redirect; validar `returnTo` interno).
- Estado autenticado obtido somente por `GET /auth/me`: `401` leva à tela de login com aviso de sessão expirada; falha de rede mostra erro com retry e nunca libera o shell. O shell e o dashboard não leem cookies nem armazenam tokens; nenhum dado de domínio é inferido no cliente.
- Caches do service worker e DTOs de `/api/v1` são tratados como dados privados; os 8 itens de navegação sem módulo implementado não renderizam formulários que possam enviar dados a endpoints inexistentes.

---

## 11. Segurança de CI/CD

- Branch `main` protegida (PR + CI verde; aprovação em migrations).
- Deploy somente via workflow; sem `wrangler deploy` manual em produção fora de emergência documentada.
- Ambientes GitHub com required reviewers para produção/migrações.
- Migrações destrutivas exigem backup + aprovação explícita.
- Token de API Cloudflare restrito por escopo e conta; não usar token global.
- Logs de CI não imprimem segredos; mascarar variáveis.
- Artifacts de build com retenção curta; não publicar source maps publicamente (ou restringir).
- Proteção contra PRs de forks executando segredos: workflows de deploy apenas em `push` para `main`, nunca `pull_request_target`.

---

## 12. Checklist de segurança por PR

- [ ] Nenhum segredo, token ou dado pessoal no diff.
- [ ] Entrada validada com Zod; saída por DTO.
- [ ] Autorização/sessão verificada no endpoint.
- [ ] Mutação grava auditoria no mesmo batch.
- [ ] Consultas indexadas; sem varredura não intencional.
- [ ] Nenhum `dangerouslySetInnerHTML` sem sanitização.
- [ ] URLs/HTML externos tratados com allowlist.
- [ ] Logs sem PII/segredos.
- [ ] Testes cobrindo regra de negócio e caso de erro.
- [ ] Dependências novas justificadas e auditadas.
- [ ] Headers/CSP não relaxados sem justificativa.
- [ ] Migração testada (upgrade + from scratch) e reversível por backup.

## 13. Checklist de lançamento (Fase 1)

- [ ] `SETUP_TOKEN` forte e removido/rotacionado após bootstrap.
- [ ] Passkeys testadas em Chrome, Safari/iOS e Firefox.
- [ ] Recuperação testada (código usado não reutiliza).
- [ ] Cookies com flags corretas em produção.
- [ ] CSP e headers verificados (securityheaders.com ou equivalente).
- [ ] Rate limits ativos e testados.
- [ ] Export/restauração testados.
- [ ] Backup R2 (se habilitado) privado e com lifecycle.
- [ ] 2FA em Cloudflare/GitHub; token escopado.
- [ ] `npm audit` sem high/critical.
- [ ] Logs revisados (sem PII).
- [ ] Teste de sessão revogada e expirada.
- [ ] Documento de resposta a incidentes revisado.

## 14. Resposta a incidentes e operações administrativas

O procedimento específico para apoiar a recuperação de acesso **sem bypass de autenticação** está em `docs/operations/admin-recovery.md`.

### 14.1 Regras obrigatórias

- **Autorização:** nenhuma ação destrutiva (`DROP`, `DELETE` em massa, purge, restauração sob dados atuais) sem aprovação explícita e exportação verificada. Testes destrutivos usam apenas o binding `DB_TEST`.
- **Rastreabilidade:** toda operação administrativa produz linha em `audit_log` com `actor_type`, `actor_id`, `request_id`, `before_json`/`after_json` redigidos (sem tokens, credenciais, IP puro, valores financeiros ou de saúde) e `ip_hash` com salt. Se a ação precisou de SQL direto de emergência, a auditoria manual é registrada no mesmo `requestId` e revisada depois.
- **Preferência:** use um endpoint autenticado (quando existir) em vez de SQL direto. SQL direto é exceção de contenção, não rotina.
- **Segredos:** `SETUP_TOKEN`, chave de IA, token Cloudflare e credenciais ficam fora do repositório e fora de logs.
- **Evidência:** exporte `audit_log` e os logs do Worker antes de qualquer correção que possa alterar estado.

### 14.2 Sequência

1. **Conter:** revogar sessões afetadas ou todas (`/auth/logout-all` ou SQL administrativo autorizado), rotacionar `SETUP_TOKEN`, chave de IA e token Cloudflare.
2. **Preservar:** exportar `audit_log`, contagens de tabelas e logs relevantes; não destruir evidências.
3. **Avaliar:** escopo (acesso? alteração? vazamento?), vetor, primeiro `request_id` suspeito e dados afetados. Consultas úteis (somente leitura):
   - `SELECT id, entity_type, entity_id, action, created_at FROM audit_log WHERE request_id = ? ORDER BY id;`
   - `SELECT id, user_id, created_at, expires_at, revoked_at FROM sessions WHERE user_id = ? ORDER BY last_seen_at;`
4. **Corrigir:** patch, deploy, migração numerada se necessário. Nunca editar migração já aplicada.
5. **Recuperar:** restaurar backup/Time Travel se houver corrupção; validar integridade (FKs, contagens e checksum da exportação) antes de liberar o acesso.
6. **Registrar:** post-mortem sem culpa em `docs/incidents/` (a criar), com linha do tempo, `request_id`s e ações.
7. **Comunicar:** usuário (o próprio), se aplicável; provedores se necessário.

Contatos e acessos de emergência devem ficar fora do repositório (gerenciador de senhas).
