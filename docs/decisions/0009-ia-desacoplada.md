# ADR-0009 — IA desacoplada, opcional e com proveniência

- **Status:** Proposto (requer aprovação)
- **Data:** 2026-11-20
- **Relacionados:** ADR-0008, SECURITY, PRODUCT_SPEC

## Contexto

O briefing exige recomendações fundamentadas, projeções e uma aplicação funcional sem IA externa. Também exige custo R$ 0 e controle dos dados. Integrar um LLM diretamente nos módulos criaria acoplamento, custo e risco de privacidade.

## Decisão

- Núcleo determinístico: regras, estatística e projeções calculam números oficiais.
- Interface `RecommendationProvider` com duas implementações:
  - `RulesRecommendationProvider` (padrão, sem rede);
  - `LlmRecommendationProvider` (opcional, BYOK, desabilitado por padrão).
- Recomendações são persistidas com `provider`, `provider_model`, `prompt_version`, `confidence` e `evidence_json`.
- A IA recebe apenas o recorte necessário, com consentimento explícito, redaction e timeout.
- Respostas de LLM são conteúdo não confiável: renderizar sanitizado, nunca executar.
- Sem tool calling que escreva dados na v1.
- Falha da IA não bloqueia o app.

## Alternativas consideradas

| Alternativa | Prós | Contras |
| --- | --- | --- |
| Só regras | Determinístico, grátis, privado | Menos flexível na redação/exploração |
| LLM integrado em cada módulo | “Inteligente” | Acoplamento, custo, privacidade, não determinístico |
| IA como serviço pago | Qualidade | Viola R$ 0 e controle de dados |
| IA no cliente (WebLLM) | Privacidade, sem custo de API | Requer hardware; UX inconsistente; adiado |

## Consequências

**Positivas:** app funciona offline de IA, custos controlados, números auditáveis, privacidade por padrão.

**Negativas/riscos:** recomendações baseadas em regras podem ser óbvias; integração de LLM exige configuração/consentimento; risco de prompt injection (mitigado por não permitir escrita e sanitizar saída).

## Critérios de revisão

- Necessidade de recomendações mais exploratórias.
- Disponibilidade de modelo local viável em PWA.
- Definição de provedor/custo pelo usuário.
