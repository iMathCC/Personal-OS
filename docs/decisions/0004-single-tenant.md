# ADR-0004 — Sistema single-tenant

- **Status:** Aceito
- **Data:** 2026-11-20
- **Relacionados:** ADR-0003, DATA_MODEL

## Contexto

O Personal OS é descrito como sistema pessoal. Multiusuário não é requisito. Adicionar `user_id` em todas as tabelas, RBAC e isolamento desde o início aumenta complexidade, superfície de erro e custo de testes.

## Decisão

Uma implantação atende **um único usuário**. Não haverá:

- cadastro público nem convites;
- `user_id`/`owner_id`/`tenant_id` em entidades de domínio pessoais (incluindo `personal_observations`);
- papéis/permissões/RBAC multiusuário;
- compartilhamento entre usuários.

Princípios explícitos:

- **Uma instalação = uma pessoa.** O modelo de dados não declara suporte a múltiplos usuários na mesma instância.
- **Isolamento por instância/deployment.** Cada implantação tem seu próprio banco/D1 e estado; não há segregação lógica entre usuários no mesmo banco porque não há múltiplos usuários.
- **Autenticação e autorização protegem a instância.** Sessão válida do único usuário é o gate; CSRF/rate-limit/idempotência continuam obrigatórios.
- **Evolução multiusuário exige nova decisão.** Qualquer suporte futuro a múltiplos usuários na mesma instância exigirá ADR novo, revisão de modelo de dados (incluindo ownership/tenant), autorização, migrações, backfill, estratégia de isolamento e reavaliação de contratos/APIs. Não deve ser introduzido implicitamente.

A tabela `users` tem uma linha, usada para preferências. A autorização é “sessão válida do único usuário”. Dados continuam isolados por implantação/banco.

## Alternativas consideradas

| Alternativa | Prós | Contras |
| --- | --- | --- |
| Single-tenant | Schema simples, menos código, menos bugs, mais fácil de raciocinar | Não permite compartilhamento; migrar para multiusuário exige mudança |
| Multiusuário desde o início | Pronto para crescer | Complexidade sem demanda; risco de isolamento incorreto; mais testes |
| Um banco por usuário (multi-tenant por D1) | Isolamento forte | Operação e migrações multiplicadas; fora do escopo |

## Consequências

**Positivas:** simplicidade, segurança mais fácil de verificar, menos joins e índices, foco no valor pessoal.

**Negativas/riscos:** se o requisito mudar, será necessário adicionar `user_id` em todas as tabelas e migrar dados; API e auth precisarão de revisão. Mitigação: manter serviços e repositórios desacoplados para permitir a mudança.

## Critérios de revisão

- Requisito explícito de multiusuário/compartilhamento.
- Uso familiar.
