# Personal OS

Sistema pessoal de gestão e inteligência orientado por dados: objetivos, projetos, atividades, métricas, finanças, estudos, carreira, leituras, treino e bem-estar em um único lugar.

> **Status: Fase 0 — Planejamento.** Nenhum código de aplicação foi implementado. A Fase 1 só começa após aprovação das decisões pendentes.

## Documentação

| Documento | Conteúdo |
| --- | --- |
| [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) | Escopo, requisitos, ambiguidades e critérios de aceitação |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitetura lógica, topologia, monorepo, limites e riscos |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Entidades, relacionamentos, índices, auditoria e retenção |
| [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md) | Contratos REST, autenticação, erros e versionamento |
| [docs/SECURITY.md](docs/SECURITY.md) | Modelo de ameaças, autenticação, proteção de dados e checklist |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Fases, entregas verificáveis e próxima tarefa |
| [docs/decisions/](docs/decisions/) | Registros de decisão de arquitetura (ADRs) |
| [AGENTS.md](AGENTS.md) | Regras permanentes para agentes e desenvolvedores |

## Restrições centrais

- Custo operacional de **R$ 0** (nenhum plano pago, domínio opcional).
- Desktop e celular via **PWA**.
- Dados sob controle do usuário, com **exportação e restauração**.
- Aplicação **funcional sem IA externa**.
- Monólito modular, API como única porta de acesso aos dados.

## Decisões que precisam de aprovação

Ver [docs/ROADMAP.md](docs/ROADMAP.md#8-decisões-pendentes-de-aprovação-humana). As principais:

1. Autenticação por passkeys (WebAuthn) — recomendada.
2. Sistema single-tenant (um usuário por implantação).
3. Uso inicial de `*.workers.dev` (sem domínio próprio) e suas consequências.
4. Escopo financeiro inicial: entrada manual + importação CSV, sem integração bancária.
5. Limites de offline: leitura em cache; escritas exigem conexão na Fase 1.
