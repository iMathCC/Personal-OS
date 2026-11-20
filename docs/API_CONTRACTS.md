# Contratos da API — Personal OS

- **Versão:** v1 (Fase 0)
- **Base:** `/api/v1`
- **Formato:** JSON UTF-8
- **Autenticação:** cookie de sessão `__Host-pos_session`
- **Status:** Proposta para aprovação

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

### 1.5 Idempotência

- `POST` de criação aceita `Idempotency-Key` (UUID ou string ≤ 128 chars).
- Mesma chave + mesmo corpo → retorna a resposta original (status e corpo).
- Mesma chave + corpo diferente → `409 CONFLICT`.
- Janela: 24 h. Respostas > 64 KB não são armazenadas (recusa com `413`).
- Importações usam `dedupe_key` por linha, além do header.

### 1.6 Concorrência otimista

- Respostas de recurso incluem `version` e header `ETag: "<version>"`.
- `PATCH`/`PUT`/`DELETE` aceitam `If-Match: "<version>"`; ausência = última versão (permitido, mas registrado).
- Versão divergente → `409 CONFLICT` com `details.currentVersion`.

### 1.7 Segurança de transporte

- HTTPS obrigatório; HSTS.
- Same-origin apenas; sem CORS por padrão.
- Mutações exigem `Origin` igual ao host e header `X-CSRF-Token` (double-submit) válido.
- Cookies: `__Host-pos_session` (HttpOnly, Secure, SameSite=Lax, Path=/) e `pos_csrf` (não HttpOnly, Secure, SameSite=Lax).

### 1.8 Limites

- Corpo JSON: 256 KB (exceto importação, 5 MB em lotes).
- Strings: 1–10.000 caracteres conforme campo.
- `metadata_json`: 16 KB.
- Respostas de lista: máximo 200 itens.

---

## 2. Autenticação

Fluxo com passkeys (WebAuthn). O servidor armazena desafios de uso único com TTL de 10 minutos.

### 2.1 Primeiro acesso (bootstrap)

`POST /auth/setup/options`

- Requer header `X-Setup-Token` igual ao segredo `SETUP_TOKEN` configurado no Worker.
- Só funciona se `users.setup_completed_at IS NULL`.
- Retorna `PublicKeyCredentialCreationOptions` + `challengeId`.

`POST /auth/setup/verify`

```json
{
  "challengeId": "uuid",
  "credential": { "id": "...", "rawId": "...", "response": { "...": "..." }, "type": "public-key" },
  "displayName": "Matheus",
  "timezone": "America/Sao_Paulo"
}
```

- Cria usuário, passkey e sessão; gera 10 códigos de recuperação (retornados **uma única vez**).
- `201` + `Set-Cookie` de sessão.

### 2.2 Login

`POST /auth/login/options` → `{ challengeId, options }` com `allowCredentials` das passkeys cadastradas.

`POST /auth/login/verify` → valida assinatura, atualiza contador, cria sessão (`200` + cookie).

`POST /auth/logout` → revoga a sessão atual (`204`).

`POST /auth/logout-all` → revoga todas as sessões do usuário (`204`).

### 2.3 Recuperação

`POST /auth/recovery/verify` com `{ code }`:

- Consome o código (hash), invalida todas as sessões e retorna `recoveryToken` de curta duração (10 min).

`POST /auth/recovery/register/options` + `/verify` com `recoveryToken`:

- Cadastra nova passkey e encerra a recuperação.
- Códigos restantes permanecem válidos; o usado é marcado.

### 2.4 Sessão

`GET /auth/me` → usuário, preferências, contagem de passkeys e sessões ativas.

`GET /auth/sessions` → lista de sessões (ID, criada em, último uso, agente resumido, atual?).

`DELETE /auth/sessions/:id` → revoga sessão específica.

### 2.5 Rotação e expiração

- Token de sessão: 32 bytes aleatórios; armazenado apenas como SHA-256.
- Expiração absoluta: 90 dias. Inatividade: 30 dias.
- `last_seen_at` atualizado no máximo 1×/hora para reduzir escritas.
- Logout/recuperação revogam imediatamente.
- Recuperação de código: hash SHA-256 (código tem alta entropia), uso único.

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
