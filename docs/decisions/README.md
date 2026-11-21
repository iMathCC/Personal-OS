# Registros de Decisão de Arquitetura (ADRs)

Cada ADR registra uma decisão estrutural, o contexto, as alternativas e as consequências. Decisões aprovadas só mudam com um novo ADR que as substitua.

## Índice

| ADR | Título | Status |
| --- | --- | --- |
| [0001](0001-stack-e-monorepo.md) | Stack inicial e monorepo | Aceito |
| [0002](0002-topologia-de-deploy.md) | Worker único servindo SPA e API | Aceito |
| [0003](0003-autenticacao.md) | Autenticação por passkeys | Aceito |
| [0004](0004-single-tenant.md) | Sistema single-tenant | Aceito |
| [0005](0005-identidade-tempo-dinheiro.md) | Identidade, tempo e dinheiro | Proposto |
| [0006](0006-contratos-de-api.md) | Contratos REST versionados | Aceito com ajustes |
| [0007](0007-auditoria-e-historico.md) | Auditoria append-only sem event sourcing | Aceito com ajustes |
| [0008](0008-agregacoes-e-limites-d1.md) | Agregações materializadas e limites do D1 | Proposto |
| [0009](0009-ia-desacoplada.md) | IA desacoplada, opcional e com proveniência | Aceito |
| [0010](0010-backup-e-exportacao.md) | Exportação aberta e backups | Aceito |
| [0011](0011-dominio-e-workers-dev.md) | Domínio e `workers.dev` | Aceito |
| [0012](0012-invariantes-operacionais-de-auth.md) | Invariantes operacionais de autenticação e auditoria | Aceito com ajustes |

## Status possíveis

- **Proposto:** aguarda aprovação humana.
- **Aceito:** aprovado e em vigor.
- **Aceito com ajustes:** aprovado com modificações registradas.
- **Substituído por ADR-XXXX:** não usar mais.
- **Rejeitado:** alternativa descartada.

## Template

```markdown
# ADR-XXXX — Título

- **Status:** Proposto | Aceito | Substituído por ADR-XXXX | Rejeitado
- **Data:** AAAA-MM-DD
- **Relacionados:** links

## Contexto
Qual problema/força motiva a decisão. Inclua restrições e fatos verificáveis.

## Decisão
O que será feito, de forma específica e testável.

## Alternativas consideradas
Tabela com prós/contras e por que foram descartadas.

## Consequências
Positivas, negativas, riscos e custos.

## Critérios de revisão
Sinais de que a decisão precisa ser reavaliada.
```
