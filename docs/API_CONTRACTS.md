# Contratos da API — Personal OS

- **Versão:** v1 (Fase 0)
- **Base:** `/api/v1`
- **Formato:** JSON UTF-8
- **Autenticação:** cookie de sessão `__Host-pos_session`
- **Status:** Proposta para aprovação; seção de autenticação (§2) implementada na Entrega 3, Estudos (§4.2) e idempotência recuperável (§1.5) implementadas na Entrega 5 da Tarefa 1.2, aguardando revisão

A API é a **única porta de acesso aos dados**. O frontend não acessa D1, R2 ou serviços externos diretamente. Contratos são definidos com Zod em `packages/shared` e reutilizados no cliente e no servidor.

---

## 1. Convenções gerais

### 1.1 Formato de resposta

Sucesso, recurso único:

```json
{
  "data": { "id": "01934f...", "title": "Correr 5 km" },
  "meta": { "requestId": "req_01J..." }
}
```

Sucesso, lista:

```json
{
  "data": [ { "id": "01934f...", "title": "Correr 5 km" } ],
  "meta": {
    "requestId": "req_01J...",
    "nextCursor": "eyJkdWVfYXQiOiJ...",
    "hasMore": true
  }
}
```

Erro:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados inválidos.",
    "details": [
      { "path": "dueAt", "message": "Data inválida." }
    ],
    "requestId": "req_01J..."
  }
}
```

- `data` é sempre objeto ou array; nunca `null` em sucesso.
- `meta.requestId` ecoa `X-Request-Id`.
- Erros nunca incluem stack trace, SQL ou nomes de tabelas.

### 1.2 Códigos de erro estáveis

| HTTP | `code` | Uso |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Corpo/params inválidos |
| 401 | `UNAUTHENTICATED` | Sem sessão válida |
| 403 | `FORBIDDEN` | CSRF/origem inválida, sessão sem permissão |
| 404 | `NOT_FOUND` | Recurso inexistente ou soft-deleted |
| 405 | `METHOD_NOT_ALLOWED` | Verbo não suportado |
| 409 | `CONFLICT` | `version` desatualizada, unicidade, estado inválido |
| 410 | `GONE` | Recurso removido definitivamente |
| 413 | `PAYLOAD_TOO_LARGE` | Corpo acima do limite |
| 422 | `BUSINESS_RULE_VIOLATION` | Regra de domínio (ex.: transferência inválida) |
| 429 | `RATE_LIMITED` | Limite de requisições |
| 500 | `INTERNAL_ERROR` | Falha inesperada |
| 503 | `DEPENDENCY_UNAVAILABLE` | D1/IA indisponível |

### 1.3 Paginação

- Query: `?limit=50&cursor=<opaco>`.
- `limit` padrão 50, máximo 200.
- Cursor é base64url de `[sortValue, id]`, opaco para o cliente; inválido → `VALIDATION_ERROR`.
- Ordenação padrão: `createdAt DESC, id DESC`; endpoints podem declarar outra.
- Sem `OFFSET`.

### 1.4 Filtros e datas

- Datas de calendário: `YYYY-MM-DD` (`from`, `to`, `date`).
- Instantes: ISO-8601 UTC (`occurredAt`, `dueBefore`).
- `from`/`to` são inclusivos, interpretados no fuso do usuário.
- Parâmetros desconhecidos são rejeitados (`VALIDATION_ERROR`) para evitar erros silenciosos.

### 1.5 Idempotência (implementada na Entrega 5)

- `POST` de criação aceita `Idempotency-Key` (1–200 bytes UTF-8, sem caracteres de controle); ausência → `400 VALIDATION_ERROR`.
- A chave canônica é `v1|subject|method|path|clientKey`, com codificação injetiva. O `subject` é o usuário autenticado; `path` não contém query. A query entra apenas no hash da requisição (método + caminho + query + corpo), nunca na identidade da chave.
- Mesma chave + mesmo conteúdo → retorna a resposta original (status e corpo byte a byte) com header `Idempotent-Replayed: true`.
- Mesma chave + conteúdo diferente → `409 CONFLICT`.
- A reserva permanente da identidade é gravada **antes** da mutação e sobrevive à limpeza da linha operacional (`idempotency_keys`, TTL 24 h). O resultado canônico fica em `operation_results` (append-only) e é a fonte do replay.
- Concorrência: o `claim` na tabela operacional é um guard de PK no mesmo `db.batch()`; apenas uma mutação vence e os demais recuperam o resultado original.
- Mutação + `audit_log` + resultado são gravados no mesmo `db.batch()`.
- Limites: corpo original 16.384 bytes; resultado gravado 32.768 bytes; espelho operacional 8.192 bytes; envelope 65.536 bytes. Resultado acima do limite aborta **antes** da mutação com `413`; apenas o espelho acima do limite usa `bodyOmitted`.
- Importações usam `dedupe_key` por linha, além do header.

### 1.6 Concorrência otimista

- Respostas de recurso incluem `version` e header `ETag: "<version>"`.
- `PATCH`/`PUT`/`DELETE` aceitam `If-Match: "<version>"`; ausência = última versão (permitido, mas registrado). Em `DELETE /studies/sessions/:id`, a versão ausente é resolvida no servidor e o `UPDATE` usa `AND version = ?` como guard atômico.
- Versão divergente → `409 CONFLICT` com `details.currentVersion`.

### 1.7 Segurança de transporte

- HTTPS obrigatório; HSTS.
- Same-origin apenas; sem CORS por padrão. `Origin` é comparado com uma allowlist explícita (`ORIGIN`/`ALLOWED_ORIGINS`), nunca derivado de header confiável.
- Mutações (`POST`/`PUT`/`PATCH`/`DELETE`) exigem `Content-Type: application/json`, `Origin` da allowlist e header `X-CSRF-Token` válido; `GET`/`HEAD`/`OPTIONS` são isentos.
- Cookies: `__Host-pos_session` (HttpOnly, Secure, SameSite=Lax, Path=/, sem `Domain`, 90 dias), `pos_csrf` (não HttpOnly, Secure, SameSite=Lax) e `pos_vid` (opaco, Secure, SameSite=Lax; complementa o subject do CSRF pré-sessão).
- Limites excedidos retornam `429 RATE_LIMITED` com header `Retry-After` (segundos). Se o D1 não responder, rotas de auth falham fechado com `503 DEPENDENCY_UNAVAILABLE`.

### 1.8 Limites

- Corpo JSON: 256 KB (exceto importação, 5 MB em lotes); rotas `/api/v1/auth/*` e mutações `/api/v1/studies/*`: 16.384 bytes (`413 PAYLOAD_TOO_LARGE`).
- Strings: 1–10.000 caracteres conforme campo.
- `metadata_json`: 16 KB.
- Respostas de lista: máximo 200 itens.

---

## 2. Autenticação

Fluxo com passkeys (WebAuthn). Desafios têm ≥ 16 bytes, TTL de 10 minutos e uso único; `up` e `uv` são obrigatórios. Origens e RP ID vêm de configuração, nunca de header. Falhas de verificação WebAuthn retornam `401 UNAUTHENTICATED` (nunca 500); consumo duplo de challenge/código/token retorna `409 CONFLICT`.

### 2.0 Rotas

| Método | Rota | Autenticação | Descrição |
| --- | --- | --- | --- |
| GET | `/auth/csrf` | não | Emite token CSRF anônimo (vinculado ao `pos_vid`) para o pré-login |
| POST | `/auth/setup/options` | `X-Setup-Token` | Inicia bootstrap |
| POST | `/auth/setup/verify` | `X-Setup-Token` | Cria conta, passkey, sessão e códigos |
| POST | `/auth/login/options` | não | Inicia login |
| POST | `/auth/login/verify` | não | Verifica passkey e cria sessão |
| POST | `/auth/logout` | sessão | Revoga a sessão atual |
| POST | `/auth/logout-all` | sessão | Revoga todas as sessões |
| POST | `/auth/recovery/verify` | não | Consome código e emite `recoveryToken` |
| POST | `/auth/recovery/register/options` | `recoveryToken` | Inicia cadastro de nova passkey |
| POST | `/auth/recovery/register/verify` | `recoveryToken` | Cadastra nova passkey e encerra recuperação |
| GET | `/auth/me` | sessão | Usuário e contagens |
| GET | `/auth/sessions` | sessão | Lista de sessões |
| DELETE | `/auth/sessions/:id` | sessão | Revoga sessão específica |

`GET /auth/csrf` responde `{ csrfToken, posVid }` e atualiza o cookie `pos_csrf`. Após setup/login/logout o subject do token muda (`session:<hash>` ↔ `anon:<vid>`); o cliente deve chamar `GET /auth/csrf` novamente antes da próxima mutação. O token fica apenas em memória no frontend — nunca em `localStorage`/`sessionStorage`.

### 2.1 Primeiro acesso (bootstrap)

`POST /auth/setup/options`

- Requer header `X-Setup-Token` igual ao segredo `SETUP_TOKEN` configurado no Worker (comparação em tempo constante).
- Só funciona se `users.setup_completed_at IS NULL`.
- Corpo `{}` (estrito); retorna `{ challengeId, options }` com `PublicKeyCredentialCreationOptions`.

`POST /auth/setup/verify`

```json
{
  "challengeId": "uuid",
  "credential": { "id": "...", "rawId": "...", "response": { "...": "..." }, "type": "public-key" },
  "displayName": "Matheus",
  "timezone": "America/Sao_Paulo",
  "passkeyName": "Passkey do notebook"
}
```

- `passkeyName` é opcional (padrão `Passkey principal`).
- Cria usuário, passkey, sessão e 10 códigos de recuperação de 128 bits (retornados **uma única vez**, armazenados só como SHA-256).
- `201` + `Set-Cookie` de `__Host-pos_session` e `pos_csrf`.

### 2.2 Login

`POST /auth/login/options` com corpo `{}` → `{ challengeId, options }` com `allowCredentials` das passkeys cadastradas.

`POST /auth/login/verify` com `{ challengeId, credential }` → valida assinatura, origem, RP ID, UP/UV e contador; cria sessão (`200` + cookies). Contadores igual ou regressivo são tratados como anomalia auditada, preservando o último valor confiável.

`POST /auth/logout` → revoga a sessão atual, `200 { loggedOut: true }` e apaga o cookie de sessão.

`POST /auth/logout-all` → revoga todas as sessões, `200 { loggedOut: true }` e apaga o cookie de sessão.

### 2.3 Recuperação

`POST /auth/recovery/verify` com `{ code }`:

- Normaliza o código (trim/minúsculas, remove espaços e hífens), consome o hash, revoga todas as sessões e retorna `{ recoveryToken, expiresAt }` (10 min).
- **Não cria sessão**: a resposta não estabelece cookie de sessão.

`POST /auth/recovery/register/options` com `{ recoveryToken }` → `{ challengeId, options }`; `POST /auth/recovery/register/verify` com `{ recoveryToken, challengeId, credential, passkeyName? }` → `{ registered: true }`.

- O token é de uso único, vinculado a `user_id` e `purpose`; o mesmo vale para o challenge.
- Códigos restantes permanecem válidos; o usado é marcado.

### 2.4 Sessão

`GET /auth/me` → `{ user, counts: { passkeys, activeSessions } }`.

`GET /auth/sessions` → array de `{ id, createdAt, lastSeenAt, expiresAt, current, userAgent }`.

`DELETE /auth/sessions/:id` → `200 { revoked: true }`.

### 2.5 Rotação, expiração e limites

- Token de sessão: 32 bytes aleatórios; armazenado apenas como SHA-256.
- Expiração absoluta: 90 dias. Inatividade: 30 dias. Máximo de 10 sessões ativas; excedente revogado por LRU no mesmo batch.
- `last_seen_at` atualizado no máximo 1×/hora para reduzir escritas.
- Sessão validada no D1 em toda requisição protegida; logout/recuperação revogam imediatamente.
- Códigos de recuperação: 128 bits, hash SHA-256, uso único.

### 2.6 Rate limits de auth

| Operação | Limite | Janela |
| --- | --- | --- |
| `POST /auth/login/options` | 30 req | 15 min por IP |
| `POST /auth/login/verify` | 10 req + 5 falhas | 15 min por IP |
| `POST /auth/setup/*` | 10 req + 5 falhas | 15 min por IP |
| `POST /auth/recovery/verify` | 5 req | 5 min por IP |
| `POST /auth/recovery/register/*` | 10 req | 5 min por IP |
| Leituras autenticadas | 600 req | 1 min por usuário |
| Escritas autenticadas | 300 req | 1 min por usuário |

Excedeu → `429 RATE_LIMITED` com `Retry-After`. IP/UA são armazenados como hash com salt; `pos_vid` complementa o subject do CSRF no pré-login.

---

## 3. Recursos centrais

### 3.1 Áreas

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/areas` | Lista áreas ativas (inclui inativas com `?includeInactive=true`) |
| POST | `/areas` | Cria área |
| GET | `/areas/:id` | Detalhe |
| PATCH | `/areas/:id` | Atualiza nome/cor/ícone/ordem |
| DELETE | `/areas/:id` | Soft delete se não houver vínculos; senão `409` |

```json
{
  "id": "01934f...",
  "key": "finance",
  "name": "Finanças",
  "description": null,
  "color": "emerald",
  "icon": "wallet",
  "sortOrder": 10,
  "isActive": true,
  "version": 1,
  "createdAt": "2026-11-20T12:00:00.000Z",
  "updatedAt": "2026-11-20T12:00:00.000Z"
}
```

### 3.2 Objetivos

| Método | Rota | Filtros |
| --- | --- | --- |
| GET | `/goals` | `areaId`, `status`, `horizon`, `parentId`, `cursor`, `limit` |
| POST | `/goals` | |
| GET | `/goals/:id` | Inclui métricas vinculadas e progresso calculado |
| PATCH | `/goals/:id` | |
| DELETE | `/goals/:id` | Soft delete; filhos precisam ser movidos/arquivados antes |
| POST | `/goals/:id/archive` | |
| POST | `/goals/:id/restore` | |

Criação:

```json
{
  "areaId": "01934f...",
  "parentGoalId": null,
  "title": "Melhorar condicionamento físico",
  "description": "Correr 10 km sem parar",
  "horizon": "medium",
  "priority": 2,
  "startDate": "2026-12-01",
  "targetDate": "2027-06-01",
  "successCriteria": "Correr 10 km em < 60 min",
  "progressMode": "metrics"
}
```

### 3.3 Projetos

`GET/POST /projects`, `GET/PATCH/DELETE /projects/:id`, `POST /projects/:id/archive`, `POST /projects/:id/restore`.

Filtros: `areaId`, `goalId`, `status`, `cursor`.

### 3.4 Tarefas

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/tasks` | `status`, `areaId`, `projectId`, `goalId`, `scheduledDate`, `dueBefore`, `q`, `cursor` |
| POST | `/tasks` | Cria |
| GET | `/tasks/:id` | |
| PATCH | `/tasks/:id` | |
| DELETE | `/tasks/:id` | Soft delete |
| POST | `/tasks/:id/complete` | Idempotente; define `completedAt` e status |
| POST | `/tasks/:id/reopen` | |
| POST | `/tasks/:id/schedule` | `{ "scheduledDate": "2026-11-21" }` |
| GET | `/tasks/agenda` | `from`, `to`, agrupado por dia |

```json
{
  "id": "01934f...",
  "title": "Revisar orçamento de novembro",
  "status": "todo",
  "priority": 2,
  "areaId": "01934f...",
  "projectId": null,
  "goalId": null,
  "dueAt": "2026-11-25T21:00:00.000Z",
  "scheduledDate": "2026-11-22",
  "estimateMinutes": 45,
  "actualMinutes": null,
  "recurrenceRule": null,
  "completedAt": null,
  "version": 1
}
```

### 3.5 Eventos

`GET/POST /events`, `GET/PATCH/DELETE /events/:id`.

Filtros: `from`, `to`, `areaId`, `projectId`, `eventType`, `q`, `cursor`. `POST` aceita `occurredAt` e calcula `localDate` no servidor.

### 3.6 Check-ins

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/checkins/:date` | `YYYY-MM-DD` |
| PUT | `/checkins/:date` | Upsert idempotente |
| GET | `/checkins` | `from`, `to`, `cursor` |
| DELETE | `/checkins/:date` | Soft delete |

`PUT` retorna `200` (existente) ou `201` (criado). Campos parciais são permitidos; `null` limpa o campo.

### 3.7 Métricas

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/metrics` | `areaId`, `isActive` |
| POST | `/metrics` | |
| GET | `/metrics/:id` | |
| PATCH | `/metrics/:id` | |
| DELETE | `/metrics/:id` | Só sem observações; senão arquiva |
| GET | `/metrics/:id/observations` | `from`, `to`, `cursor` |
| POST | `/metrics/:id/observations` | Cria 1 |
| POST | `/metrics/observations/bulk` | Até 500 por lote, atômico |
| POST | `/metrics/:id/observations/:obsId/supersede` | Corrige valor |
| GET | `/metrics/:id/series` | `granularity=day\|week\|month`, `from`, `to` |

Série:

```json
{
  "data": {
    "metric": { "id": "01934f...", "key": "sleep_hours", "unit": "h" },
    "granularity": "day",
    "points": [
      { "date": "2026-11-18", "value": 7.5, "sampleCount": 1 },
      { "date": "2026-11-19", "value": null, "sampleCount": 0 }
    ],
    "algorithmVersion": "agg-v1:avg"
  }
}
```

Lacunas são `null` explícito, nunca zero.

### 3.8 Dashboard

`GET /dashboard/summary?from=2026-11-01&to=2026-11-30`

```json
{
  "data": {
    "period": { "from": "2026-11-01", "to": "2026-11-30", "timezone": "America/Sao_Paulo" },
    "scorecards": [
      { "key": "tasks_completed", "label": "Tarefas concluídas", "value": 42, "previous": 35, "unit": "count" },
      { "key": "savings_rate", "label": "Taxa de poupança", "value": 0.18, "previous": 0.12, "unit": "ratio" }
    ],
    "alerts": [
      { "id": "01934f...", "severity": "warning", "title": "Meta sem progresso há 30 dias", "href": "/goals/01934f..." }
    ],
    "charts": [
      { "key": "net_worth", "type": "line", "seriesRef": "/metrics/01934f.../series?granularity=month" }
    ],
    "generatedAt": "2026-11-20T12:00:00.000Z"
  }
}
```

- Endpoint de composição (somente leitura); cada bloco declara a fonte.
- Não calcula em tempo real varreduras pesadas; usa agregados.
- `ETag`/`Cache-Control: private, max-age=60` para reduzir requisições.

### 3.9 Auditoria

`GET /audit?entityType=task&entityId=...&from=...&to=...&cursor=...`

Retorna apenas metadados e diffs permitidos; valores sensíveis podem ser mascarados conforme configuração.

---

## 4. Módulos especializados (Fase 4)

Padrão uniforme: `GET/POST /<recurso>`, `GET/PATCH/DELETE /<recurso>/:id`, com filtros por período e paginação por cursor.

| Recurso | Filtros principais | Particularidades |
| --- | --- | --- |
| `/finance/accounts` | `type`, `includeArchived` | Saldo derivado em `GET /:id/balance` |
| `/finance/transactions` | `accountId`, `categoryId`, `from`, `to`, `status`, `q` | `POST /finance/transfers` cria duas pernas |
| `/finance/categories` | `kind` | Seed editável |
| `/finance/summary` | `from`, `to` | Receitas, despesas, saldo, por categoria |
| `/finance/import/csv` | — | `POST` multipart, dry-run + confirmação |
| `/studies/courses` | `status` | |
| `/studies/sessions` | `courseId`, `from`, `to` | |
| `/career/skills` | `category`, `archived` | |
| `/career/projects` | `status` | |
| `/reading/books` | `status`, `q` | |
| `/reading/sessions` | `bookId`, `from`, `to` | |
| `/training/exercises` | `muscleGroup`, `equipment` | |
| `/training/workouts` | `type`, `from`, `to` | Inclui sets no detalhe |
| `/wellbeing/records` | `kind`, `from`, `to` | |
| `/habits` | `active`, `areaId` | |
| `/habits/:id/logs` | `from`, `to` | Upsert por data |

### 4.1 Exemplo: transação

```json
{
  "accountId": "01934f...",
  "categoryId": "01934f...",
  "amountCents": -12590,
  "currency": "BRL",
  "occurredAt": "2026-11-20T15:30:00.000Z",
  "description": "Supermercado",
  "payee": "Mercado X",
  "status": "cleared",
  "notes": null
}
```

Regras: `amountCents != 0`; moeda igual à da conta; `externalRef`/`dedupeKey` para idempotência de importação.

### 4.2 Estudos — vertical slice implementado (Entrega 5)

Base: `/api/v1/studies`. Todas as rotas exigem sessão e CSRF. Contratos Zod em `packages/shared/src/studies.ts`.

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/studies/areas` | Área ativa de Estudos (seed) |
| GET | `/studies/courses` | Cursos ativos (≤ 200) |
| POST | `/studies/courses` | Cria curso; exige `Idempotency-Key` |
| POST | `/studies/sessions` | Cria sessão + observação derivada + evento; exige `Idempotency-Key` |
| GET | `/studies/sessions` | Lista por `from`, `to`, `courseId`, `cursor`, `limit` (≤ 200) |
| GET | `/studies/sessions/:id` | Detalhe com observações |
| GET | `/studies/sessions/:id/observations` | Observações da sessão |
| DELETE | `/studies/sessions/:id` | Exclusão lógica; aceita `If-Match` |
| POST | `/studies/observations/:id/supersede` | Corrige valor preservando a original; exige `Idempotency-Key` |
| GET | `/studies/series` | `from`, `to`, `granularity=day\|week` |
| GET | `/studies/dashboard` | `from`, `to` |

Corpo de criação de sessão:

```json
{
  "courseId": null,
  "topic": "Revisão de algoritmos",
  "startedAt": "2026-11-20T23:30:00.000Z",
  "timezone": "America/Sao_Paulo",
  "durationMinutes": 45,
  "unitsCompleted": null,
  "notes": null
}
```

`timezone` é validado como identificador IANA; `local_date` é calculado no servidor a partir dele (nunca do fuso do Worker). A resposta `201` devolve a sessão com `localDate: "2026-11-20"`. A duração gera uma observação em `study_minutes` com `sourceId: "src_calculation"` e `algorithmVersion: "study-minutes-v1"`; `notes` nunca entra no snapshot de auditoria.

Correção: `{ "valueNum": 60, "reason": "..." }` (campo `reason` aceito mas não persistido em texto livre). A original permanece com `supersededBy` apontando para a substituição; a substituição usa `src_manual`. Segunda correção da mesma observação → `409`.

Série:

```json
{
  "data": {
    "metricKey": "study_minutes",
    "unit": "min",
    "granularity": "day",
    "points": [
      { "date": "2026-11-18", "value": 45, "sampleCount": 1 },
      { "date": "2026-11-19", "value": null, "sampleCount": 0 }
    ],
    "algorithmVersion": "study-minutes-v1",
    "timezone": "America/Sao_Paulo"
  },
  "meta": { "requestId": "req_01J..." }
}
```

Lacunas são `null` explícito, nunca zero. Séries e dashboard são calculadas sob demanda sobre observações ativas com limite de 10.000 linhas e ≤ 8 queries; não há agregados materializados nesta entrega (ADR-0008 segue proposto).

---

## 5. Inteligência

### 5.1 Projeções

`POST /projections`

```json
{
  "metricId": "01934f...",
  "goalId": null,
  "method": "monte_carlo",
  "scenario": "base",
  "horizonStart": "2026-12-01",
  "horizonEnd": "2027-06-01",
  "assumptions": {
    "monthlyContributionCents": 100000,
    "annualReturn": 0.06,
    "volatility": 0.12
  },
  "parameters": { "simulations": 2000, "seed": 42 }
}
```

- `201` retorna `projections` + `points` (p10/p50/p90) + `inputHash` + `algorithmVersion`.
- Limites: horizonte ≤ 10 anos; `simulations` ≤ 5.000; CPU medida (se exceder, processar em job e retornar `202` — decisão futura).
- `GET /projections?metricId=&goalId=`, `GET /projections/:id`, `DELETE /projections/:id`.
- `POST /projections/:id/recompute` gera nova projeção com os dados atuais.

### 5.2 Recomendações

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/recommendations` | `status`, `areaId`, `goalId`, `cursor` |
| POST | `/recommendations/generate` | Executa motor de regras; idempotente por dia |
| PATCH | `/recommendations/:id` | `{ "status": "accepted" \| "dismissed" \| "acted" }` |
| GET | `/recommendations/:id` | Inclui evidências |

Nenhum `PATCH` altera dados de negócio; apenas o estado da recomendação.

---

## 6. Exportação, importação e administração

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/export?format=json&includeDeleted=false` | Export completo (streaming) |
| GET | `/export?format=csv&module=finance` | Export por módulo |
| POST | `/import/validate` | Dry-run; retorna contagens e erros |
| POST | `/import` | Aplica importação em banco vazio (Fase 1) |
| GET | `/health` | Público; `{ status, version, time }` sem dados sensíveis |
| GET | `/usage` | Uso estimado de D1/Workers no dia (admin) |
| POST | `/admin/recompute` | Recalcula agregados de um período |

Export retorna `Content-Disposition` e checksum no header `X-Content-SHA256`.

---

## 7. Cache e ETags

- GETs de recursos: `ETag` baseado em `version` + `updatedAt`; suporta `If-None-Match` → `304`.
- Dashboard: `Cache-Control: private, max-age=60`; invalidação por `updatedAt` agregado.
- Referências (áreas, métricas): `max-age=300`.
- Nunca cachear respostas autenticadas em CDN pública; `private` sempre.
- Service Worker usa cache próprio e limpa no logout.

---

## 8. Versionamento

- Prefixo `/api/v1`; mudanças incompatíveis exigem `/v2`.
- Adições compatíveis (novos campos opcionais, novos endpoints) não mudam a versão.
- Campos nunca são removidos/renomeados sem depreciação documentada.
- Contratos Zod são a fonte de verdade; testes de contrato garantem compatibilidade.
- Cliente e servidor evoluem juntos (monorepo), mas a API permanece estável para exportações/scripts.

---

## 9. Exemplos de erros de domínio

```json
{
  "error": {
    "code": "BUSINESS_RULE_VIOLATION",
    "message": "A transferência deve ter duas pernas com valores opostos.",
    "details": { "rule": "transfer_balanced" },
    "requestId": "req_01J..."
  }
}
```

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "O registro foi alterado por outra sessão.",
    "details": { "currentVersion": 7 },
    "requestId": "req_01J..."
  }
}
```

---

## 10. Itens ainda não definidos (não implementar sem decisão)

- Push notifications e e-mail (fora do escopo v1).
- Webhooks de entrada/saída.
- Integrações bancárias.
- Compartilhamento/multiusuário.
- Upload de arquivos/anexos (R2) — estrutura prevista, endpoints adiados.
- Sincronização offline com fila de mutações.
