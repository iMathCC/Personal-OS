# Especificação de Produto — Personal OS

- **Versão:** 1.0 (Fase 0)
- **Data:** 2026-11-20
- **Status:** Proposta para aprovação
- **Responsável:** Engenharia de software

Este documento define **o que** o sistema deve fazer. Decisões de **como** estão em [ARCHITECTURE.md](ARCHITECTURE.md), [DATA_MODEL.md](DATA_MODEL.md) e nos [ADRs](decisions/).

Legenda de status:

- **Confirmado** — derivado diretamente do briefing.
- **Proposto** — interpretação ou detalhe sugerido pela engenharia; requer aprovação.
- **Pendente** — bloqueia ou condiciona a implementação.

---

## 1. Propósito

Centralizar informações de diferentes áreas da vida, relacioná-las a objetivos de curto, médio e longo prazo, acompanhar indicadores, gerar projeções e apoiar decisões.

O produto não é apenas um agregador de registros. O valor central está em:

1. **Fechar o ciclo** entre registrar → medir → analisar → decidir → planejar → registrar.
2. **Preservar a origem** de cada informação (manual, integração, inferência ou cálculo).
3. **Tornar indicadores e projeções reproduzíveis**, com premissas e incerteza explícitas.
4. **Recomendar com evidências**, sem executar ações automaticamente.

## 2. Usuário e contexto

- **Confirmado:** sistema pessoal, de uso individual.
- **Proposto:** uma implantação atende um único usuário (single-tenant). Não há cadastro público, convites, papéis ou compartilhamento na v1.
- **Proposto:** idioma pt-BR, moeda BRL, fuso horário configurável (padrão `America/Sao_Paulo`), semana começando na segunda-feira. Formatos e moeda devem ser configuráveis, mas não haverá conversão cambial na v1.
- **Proposto:** uso principal em desktop para planejamento/análise e em celular para registro rápido (check-in, tarefas, treino, leitura, transações).

## 3. Escopo

### 3.1 Dentro do escopo (v1)

- Dashboard geral e dashboards por área.
- Registro diário de acontecimentos e check-in.
- Planejamento diário, semanal e mensal de atividades.
- Objetivos hierárquicos, projetos e tarefas.
- Métricas, observações, agregações, tendências e correlações.
- Projeções determinísticas com premissas, horizonte e incerteza.
- Recomendações baseadas em regras determinísticas, com evidências.
- Módulos especializados: finanças, estudos, carreira, leituras, treino, saúde/bem-estar e hábitos.
- Exportação/restauração de dados.
- PWA instalável, responsiva, com leitura offline básica.
- Automações internas via cron (agregações, lembretes em app, backup).

### 3.2 Fora do escopo (v1)

- Multiusuário, colaboração, compartilhamento e permissões.
- Aplicativos nativos iOS/Android (a PWA cobre o caso de uso).
- Integrações bancárias automáticas (Open Finance) e conciliação automática.
- Sincronização bidirecional com Google Calendar/Notion etc.
- E-mail transacional, SMS, push notifications do servidor.
- Criptografia ponta a ponta (E2EE).
- Edição colaborativa em tempo real.
- Microsserviços, Kubernetes, filas dedicadas ou arquitetura multiagente.
- Recomendações que executem alterações sem confirmação humana.
- Consultoria financeira, médica ou jurídica; o sistema apresenta dados e cálculos, não prescrições.

## 4. Princípios de produto

1. **Determinístico por padrão.** Cálculos financeiros, estatísticos e projeções usam regras explícitas e versionadas. IA é opcional.
2. **Origem sempre visível.** Todo dado mostra de onde veio e quando foi atualizado.
3. **Sem números mágicos.** Indicadores exibem período, amostra, unidade, fórmula e lacunas.
4. **Incerteza explícita.** Projeções têm premissas, horizonte e faixa de incerteza; nunca um único número apresentado como certeza.
5. **Registro de baixa fricção.** Celular deve permitir registrar em poucos toques.
6. **Dados portáveis.** Exportação completa em formatos abertos a qualquer momento.
7. **Degradação graciosa.** Sem IA externa, o núcleo continua funcionando. Sem rede, a leitura em cache continua.
8. **Privacidade primeiro.** Nenhum dado é enviado a terceiros sem ação e consentimento explícitos.

## 5. Mapa de áreas e módulos

| Área (key) | Objetivo | Entidades principais | Fase |
| --- | --- | --- | --- |
| Finanças (`finance`) | Entender fluxo de caixa, patrimônio e hábitos financeiros | `accounts`, `transactions`, `transaction_categories` | 4 |
| Estudos (`studies`) | Planejar e medir aprendizado formal | `courses`, `study_sessions` | 4 |
| Carreira (`career`) | Desenvolver competências e registrar projetos profissionais | `career_skills`, `career_projects` | 4 |
| Leituras (`reading`) | Acompanhar leitura e retenção de conhecimento | `books`, `reading_sessions` | 4 |
| Treino (`training`) | Registrar treinos, volume e progressão | `workouts`, `exercises`, `workout_sets` | 4 |
| Saúde e bem-estar (`health`) | Acompanhar sono, humor, energia, estresse e hábitos | `wellbeing_records`, `habits`, `habit_logs`, `daily_checkins` | 3–4 |
| Atividades (`activities`) | Planejar e executar tarefas diárias/semanais/mensais | `tasks`, `events` | 2 |
| Vida e estratégia (`life`) | Objetivos, projetos e visão de longo prazo | `goals`, `projects` | 2 |

> As áreas são registros configuráveis, semeadas com essas oito chaves. Módulos especializados pertencem implicitamente à sua área; entidades centrais (`goals`, `projects`, `tasks`, `events`, `metrics`) podem referenciar qualquer área.

## 6. Requisitos funcionais

Prioridade: **M** (must), **S** (should), **C** (could). Fase indica a primeira entrega prevista.

### 6.1 Plataforma e acesso

| ID | Requisito | Prior. | Fase | Critério de aceitação |
| --- | --- | --- | --- | --- |
| FR-001 | Acessar o sistema por navegador em desktop e celular, com layout responsivo | M | 1 | Fluxos críticos utilizáveis em viewport de 360 px e 1280 px; sem scroll horizontal |
| FR-002 | Instalar como PWA com ícone, splash e funcionamento standalone | M | 1 | Lighthouse PWA instalável; app abre sem barra do navegador |
| FR-003 | Autenticar com passkey (WebAuthn), manter sessão segura e permitir logout em todos os dispositivos | M | 1 | Login/cadastro de passkey funcionam em desktop e celular; sessão revogável |
| FR-004 | Recuperar acesso com códigos de recuperação de uso único | M | 1 | Código válido permite redefinir passkey; código usado não funciona novamente |
| FR-005 | Exibir estado offline e permitir leitura de dados recentes em cache | S | 1 | Shell e última visão carregada abrem sem rede; mutações são bloqueadas com aviso |
| FR-006 | Aplicar tema claro/escuro e respeitar preferência do sistema | C | 2 | Alternância persiste entre sessões |

### 6.2 Dashboard e navegação

| ID | Requisito | Prior. | Fase | Critério de aceitação |
| --- | --- | --- | --- | --- |
| FR-010 | Dashboard geral com indicadores-chave, alertas e gráficos | M | 2 | Carrega em < 2 s em conexão 4G simulada; cada cartão informa período e origem |
| FR-011 | Dashboards por área com widgets específicos | M | 4 | Cada área possui ao menos um indicador e uma visualização |
| FR-012 | Navegação por período (dia, semana, mês, ano, intervalo customizado) | M | 2 | Filtro altera todos os widgets compatíveis e é refletido na URL |
| FR-013 | Drill-down de indicador para observações de origem | S | 3 | Clique em ponto do gráfico lista observações que o compõem |
| FR-014 | Comparação entre períodos e metas | S | 3 | Exibe valor atual, período anterior, variação e meta quando existir |

### 6.3 Registro e planejamento

| ID | Requisito | Prior. | Fase | Critério de aceitação |
| --- | --- | --- | --- | --- |
| FR-020 | Registrar acontecimentos com data/hora, área, título, descrição e vínculos opcionais | M | 2 | Criação/edição/listagem; origem `manual` registrada |
| FR-021 | Check-in diário único por data com humor, energia, sono, estresse, foco e reflexão | M | 2 | Upsert por data; não permite duplicata; campos propostos validados |
| FR-022 | Criar tarefas com status, prioridade, prazo, agendamento e vínculo a projeto/objetivo | M | 2 | CRUD completo, conclusão idempotente, filtros por status e período |
| FR-023 | Visões de planejamento diário, semanal e mensal | M | 2 | Arrastar/agendar tarefa é persistido; visão semanal mostra carga por dia |
| FR-024 | Registrar tempo estimado e real de tarefas | S | 2 | Soma de tempo real por projeto/área disponível em relatório |
| FR-025 | Criar tarefas recorrentes com regra explícita (RRULE) | C | 3 | Ocorrências geradas de forma determinística e sem duplicatas |
| FR-026 | Registrar hábitos com meta e frequência; marcar cumprimento diário | M | 4 | Log único por hábito/data; sequência e taxa de conclusão calculadas |
| FR-027 | Histórico de alterações visível para entidades editáveis | S | 2 | Tela mostra quem/quando/o que mudou, a partir do `audit_log` |

### 6.4 Objetivos e projetos

| ID | Requisito | Prior. | Fase | Critério de aceitação |
| --- | --- | --- | --- | --- |
| FR-030 | Criar objetivos hierárquicos com horizonte curto/médio/longo, prazo e critério de sucesso | M | 2 | Hierarquia sem ciclos; horizontes configuráveis; status e progresso |
| FR-031 | Vincular objetivos a métricas com linha de base, meta e direção | M | 3 | Progresso calculado de forma reproduzível a partir das observações |
| FR-032 | Criar projetos vinculados a objetivo e/ou área | M | 2 | CRUD; projeto sem objetivo é permitido e sinalizado |
| FR-033 | Calcular progresso de objetivo a partir de projetos/tarefas/métricas | S | 3 | Fórmula documentada e exibida; pesos configuráveis |
| FR-034 | Arquivar objetivos/projetos sem apagar histórico | S | 2 | Arquivamento preserva vínculos e dados; restauração disponível |

### 6.5 Métricas e análise

| ID | Requisito | Prior. | Fase | Critério de aceitação |
| --- | --- | --- | --- | --- |
| FR-040 | Definir métricas com unidade, tipo, agregação, direção e cadência | M | 3 | Métrica inválida é rejeitada; mudanças de definição são auditadas |
| FR-041 | Registrar observações com data/hora, valor, origem e idempotência | M | 3 | Reimportar o mesmo dado não duplica observação |
| FR-042 | Corrigir observação sem perder o valor anterior | M | 3 | Valor antigo permanece acessível via `superseded_by` e auditoria |
| FR-043 | Calcular agregações diárias/semanais/mensais de forma reproduzível | M | 3 | Recalcular o mesmo período gera o mesmo resultado; versão do algoritmo registrada |
| FR-044 | Visualizar séries temporais, tendência, médias móveis e variação | M | 3 | Gráficos interativos; períodos sem dados explicitados |
| FR-045 | Calcular correlação entre métricas com tamanho de amostra e ressalvas | S | 3 | Coeficiente, n e aviso de correlação ≠ causalidade |
| FR-046 | Detectar lacunas e valores discrepantes (outliers) | C | 3 | Lacunas listadas; outlier marcado, nunca removido automaticamente |
| FR-047 | Comparar métricas de áreas diferentes em um mesmo painel | S | 3 | Seleção de até 6 séries com eixos normalizados |

### 6.6 Projeções e recomendações

| ID | Requisito | Prior. | Fase | Critério de aceitação |
| --- | --- | --- | --- | --- |
| FR-050 | Gerar projeções com método, premissas, horizonte e intervalos de incerteza | M | 5 | Resultado inclui todos os metadados; reprodutível por hash de entrada e versão |
| FR-051 | Simular cenários (conservador, base, otimista) com premissas editáveis | S | 5 | Cenários comparáveis no mesmo gráfico; premissas persistidas |
| FR-052 | Sinalizar projeção desatualizada quando dados de entrada mudarem | S | 5 | `input_hash` diferente marca projeção como stale |
| FR-053 | Gerar recomendações determinísticas com evidências e nível de confiança | M | 5 | Cada recomendação referencia dados que a fundamentam |
| FR-054 | Aceitar, dispensar ou marcar recomendação como executada | M | 5 | Estado persistido; nenhuma ação de negócio é executada automaticamente |
| FR-055 | Usar provedor de IA externo opcional, com consentimento e sem quebrar o núcleo | C | 5 | Com IA desabilitada, todas as funções determinísticas continuam operando |

### 6.7 Módulos especializados

| ID | Requisito | Prior. | Fase | Critério de aceitação |
| --- | --- | --- | --- | --- |
| FR-060 | Registrar contas e transações com valores em centavos, categoria e status | M | 4 | Saldo derivado confere com soma das transações; sem float em saldos |
| FR-061 | Importar transações via CSV com pré-visualização e rejeição de duplicatas | M | 4 | Dry-run mostra linhas válidas/inválidas; importação é atômica por lote |
| FR-062 | Registrar cursos e sessões de estudo com duração e tópico | M | 4 | Sessões compõem horas por curso/período |
| FR-063 | Registrar competências e projetos de carreira | M | 4 | Competências vinculáveis a projetos; nível e alvo rastreáveis |
| FR-064 | Registrar livros e sessões de leitura com páginas/minutos | M | 4 | Progresso não excede total de páginas; histórico preservado |
| FR-065 | Registrar treinos, exercícios e séries com carga/repetições | M | 4 | Volume semanal por grupo muscular calculável |
| FR-066 | Registrar medições de bem-estar (sono, peso, FC repouso etc.) | M | 4 | Múltiplos registros por dia; unidade obrigatória |
| FR-067 | Exportar cada módulo em CSV/JSON | M | 4 | Exportação inclui cabeçalhos, tipos e metadados de origem |

### 6.8 Dados, integrações e automação

| ID | Requisito | Prior. | Fase | Critério de aceitação |
| --- | --- | --- | --- | --- |
| FR-070 | Exportar todos os dados em JSON versionado e módulos em CSV | M | 1 | Arquivo contém versão de schema, data, contagens e checksum |
| FR-071 | Restaurar exportação em banco vazio com validação e relatório | M | 1 | Dry-run valida integridade referencial; restauração falha de forma atômica |
| FR-072 | Executar backup automático semanal quando R2 estiver habilitado | S | 6 | Cron gera export, envia ao bucket privado e registra resultado |
| FR-073 | Importar dados históricos de planilhas mapeando colunas | C | 6 | Mapeamento salvo; linhas inválidas reportadas sem perda silenciosa |
| FR-074 | Registrar origem de integrações com referência externa idempotente | S | 6 | Mesma referência externa não gera duplicata |
| FR-075 | Executar agregações noturnas e gerar lembretes em app | S | 3 | Cron executa em < 10 s de CPU total; falhas ficam registradas |
| FR-076 | Exibir uso de limites do plano gratuito (D1/Workers) ao usuário | C | 6 | Painel mostra leitura/escrita diária e armazenamento estimados |

## 7. Requisitos não funcionais

| ID | Categoria | Requisito | Verificação |
| --- | --- | --- | --- |
| NFR-001 | Custo | Operação em R$ 0, sem plano pago ou cartão obrigatório | Checklist de dependências e faturamento |
| NFR-002 | Desempenho | API p95 < 500 ms (excluindo rede) e CPU < 10 ms por requisição no plano free | Testes de carga locais + métricas de CPU |
| NFR-003 | Desempenho | Dashboard inicial p95 < 2 s em 4G; bundle inicial < 250 KB gzip (gráficos sob demanda) | Lighthouse/CI budget |
| NFR-004 | Disponibilidade | Funcionar dentro dos limites gratuitos; falha explícita ao exceder, sem perda silenciosa | Testes de erro + UI de degradação |
| NFR-005 | Portabilidade | Exportação completa e schema SQL padrão; lógica de domínio sem dependência de Cloudflare | Teste de restauração + revisão de imports |
| NFR-006 | Privacidade | Nenhum dado pessoal enviado a terceiros sem consentimento explícito | Revisão de chamadas externas + teste |
| NFR-007 | Segurança | Autenticação obrigatória; sessões revogáveis; CSP; validação em toda entrada | Checklist de SECURITY.md |
| NFR-008 | Acessibilidade | Navegação por teclado, foco visível, contraste AA, rótulos ARIA | axe + testes manuais |
| NFR-009 | Responsividade | 360 px–1920 px, áreas de toque ≥ 44 px | Testes em viewports |
| NFR-010 | Manutenibilidade | TypeScript estrito, módulos com contratos, testes para regras de negócio | CI + cobertura |
| NFR-011 | Observabilidade | Request ID, logs estruturados, erros rastreáveis sem PII | Revisão de logs |
| NFR-012 | Localização | pt-BR na UI; datas ISO e moeda formatada por `Intl` | Testes de formatação |
| NFR-013 | Resiliência | Escritas atômicas; operações idempotentes em endpoints de criação | Testes de concorrência/repetição |
| NFR-014 | Migração | Migrações versionadas, revisadas e reversíveis por backup | Teste de migração do zero e upgrade |

## 8. Regras de negócio determinísticas

### 8.1 Dinheiro

- Valores monetários são **inteiros em centavos** no banco e na API. Nunca `float` para saldo.
- Saldo de conta = `opening_balance_cents` + soma das transações `cleared` (transferências internas não alteram patrimônio total).
- Transferências usam `transfer_group_id` e duas pernas; relatórios de patrimônio excluem o grupo.
- Arredondamento só na apresentação; agregações somam inteiros.
- BRL é a moeda inicial. Campos de moeda existem, mas conversão cambial está fora do escopo.

### 8.2 Tempo

- Persistir instantes em **UTC ISO-8601 com milissegundos** (`2026-11-20T18:30:00.000Z`).
- Persistir também `local_date` (`YYYY-MM-DD`) calculada no fuso do usuário para agrupamentos diários.
- Fuso IANA configurável (`America/Sao_Paulo` padrão). Mudança de fuso não reescreve `local_date` históricos.
- Semana começa na segunda-feira por padrão; configurável.
- "Hoje" é sempre derivado do fuso do usuário, não do servidor.

### 8.3 Métricas

- Uma observação é imutável. Correção = nova observação + `superseded_by` na anterior + auditoria.
- Agregação padrão por métrica: `sum`, `avg`, `last`, `min`, `max` ou `count`.
- Períodos sem dados são **lacunas explícitas**, não zero.
- Cálculos registram `algorithm_version` e período de entrada.
- Correlação exige n ≥ 14 e exibe n, coeficiente e ressalva de causalidade.
- Outliers são sinalizados, nunca removidos automaticamente.

### 8.4 Projeções

- Métodos iniciais: tendência linear, crescimento composto e Monte Carlo com PRNG semeado.
- Toda projeção armazena: método, versão, parâmetros, premissas, horizonte, `input_hash`, data de geração e faixas p10/p50/p90.
- Projeção é marcada `stale` se o hash dos dados de entrada mudar.
- Nenhuma projeção é apresentada como garantia; UI sempre mostra premissas e incerteza.

### 8.5 Recomendações

- Motor de regras determinístico gera candidatos a partir de condições explícitas (ex.: taxa de poupança abaixo da meta por 3 meses; sono médio < 7 h; meta sem progresso há 30 dias).
- Cada recomendação guarda evidências (referências + valores no momento da geração) e confiança.
- Estados: `new`, `accepted`, `dismissed`, `acted`, `expired`. Nenhum estado altera dados de negócio automaticamente.
- IA externa, se habilitada, apenas redige/explica recomendações; não calcula números oficiais nem escreve dados.

## 9. Ambiguidades e decisões de produto

| ID | Pergunta | Impacto | Recomendação | Status |
| --- | --- | --- | --- | --- |
| Q-01 | O sistema é estritamente de um usuário? | Modelo de dados, auth, API | Single-tenant; um usuário por implantação | Proposto |
| Q-02 | Qual método de autenticação? | UX, segurança, CPU no free tier | Passkeys + códigos de recuperação | Proposto |
| Q-03 | Haverá domínio próprio? | Custo, RP ID das passkeys, Cloudflare Access | Começar em `*.workers.dev`; decidir antes do cadastro de passkeys | Pendente |
| Q-04 | Finanças incluem integração bancária? | Custo, segurança, complexidade | Manual + CSV na v1; Open Finance fora do escopo | Proposto |
| Q-05 | Quais campos no check-in diário? | Schema, UX móvel | Lista da seção 8 do DATA_MODEL; validar com uso real | Proposto |
| Q-06 | Notificações/lembretes? | Engajamento, dependências | Somente in-app + notificações locais da PWA; sem e-mail/push servidor | Proposto |
| Q-07 | Offline deve permitir escrita? | Complexidade de sync/conflito | Fase 1: leitura offline, escrita online; reavaliar na Fase 6 | Proposto |
| Q-08 | Quais horizontes de objetivo? | Schema/UX | Curto ≤ 3 meses, médio ≤ 12 meses, longo > 12 meses; configurável | Proposto |
| Q-09 | Há mais de uma moeda em uso? | Relatórios financeiros | BRL apenas; sem câmbio | Proposto |
| Q-10 | IA externa: qual provedor e quem paga? | Privacidade, custo | Nenhum por padrão; BYOK opcional, desabilitado | Pendente |
| Q-11 | Unidades de medida (métrico/imperial)? | Treino/bem-estar | Métrico (kg, cm, km); exibição configurável depois | Proposto |
| Q-12 | Importar dados existentes de planilhas? | Migração inicial | Sim, via CSV mapeado na Fase 6; começar manual | Proposto |
| Q-13 | Retenção de dados e exclusão? | Privacidade, storage | Dados mantidos até exclusão; soft delete 30 dias; auditoria 12 meses | Proposto |
| Q-14 | Backup automático exige R2? | Custo/cartão | R2 opcional; fallback exportação manual mensal | Proposto |
| Q-15 | Quais indicadores no dashboard inicial? | Escopo Fase 2 | Definir 6–8 widgets na aprovação da Fase 1 | Pendente |

## 10. Critérios de sucesso do sistema

Não são metas de resultado pessoal; são critérios de que o **sistema** cumpre o propósito.

1. Um registro feito no celular aparece no desktop em < 5 s após sincronizar.
2. Todo indicador do dashboard é rastreável até suas observações de origem.
3. Uma exportação completa pode ser restaurada em ambiente limpo sem perda de vínculos.
4. O sistema opera 30 dias consecutivos dentro dos limites gratuitos sem intervenção manual.
5. Uma recomendação sempre exibe evidências e pode ser descartada sem efeitos colaterais.
6. Uma projeção pode ser recalculada e produz o mesmo resultado com os mesmos dados e parâmetros.
7. Nenhuma funcionalidade central depende de IA externa.

## 11. Glossário

| Termo | Definição |
| --- | --- |
| Área | Domínio de vida (finanças, estudos etc.) usado para agrupar entidades e dashboards |
| Objetivo | Resultado desejado com horizonte, prazo e critério de sucesso mensurável |
| Projeto | Esforço finito que contribui para um ou mais objetivos |
| Evento | Acontecimento registrado pelo usuário, com data/hora e vínculos opcionais |
| Observação | Valor de uma métrica em um instante, com origem e confiança |
| Indicador | Valor derivado de observações por uma regra de agregação versionada |
| Projeção | Estimativa futura com método, premissas, horizonte e incerteza |
| Recomendação | Sugestão fundamentada em evidências, sujeita a decisão humana |
| Origem | Proveniência: manual, importação, integração, inferência ou cálculo |
| Check-in | Registro diário subjetivo de estado e reflexão |
