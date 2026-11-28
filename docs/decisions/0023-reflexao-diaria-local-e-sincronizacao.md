# ADR-0023 — Reflexão diária: persistência local e proposta de sincronização

- **Data:** 27/11/2026
- **Status:** Proposto (não implementado no backend); D35/D36 usam rascunho local explícito

## Contexto

A D35 introduziu revisão diária em `/revisao-diaria` com reflexão curta opcional. Não existe contrato backend para reflexão diária. A revisão semanal já persiste reflexões estruturadas por semana (`weekly_reviews.reflections`, versionadas/auditadas), mas **não é equivalente** à reflexão diária: granularidade, contexto e intenção são diferentes (dia local vs. semana).

A D36 exige persistência honesta: enquanto não houver sincronização, a UI deve deixar claro que o rascunho é local do dispositivo.

## Estado atual (D36)

- **Persistência:** `localStorage` no navegador, chave `personal-os:daily-reflection:<YYYY-MM-DD>` (data local da conta).
- **Escopo:** dispositivo/navegador atual; não enviado à API; não sincronizado; não auditado no backend.
- **UX:** rótulo explícito "rascunho local deste dispositivo"; botão "Salvar rascunho local"; link para revisão semanal para reflexão versionada no backend.
- **Risco aceito:** perda ao limpar dados do navegador/trocar dispositivo. Mitigado por comunicação clara.

## Decisão proposta (futura, se implementada)

1. **Entidade mínima:** `daily_reflections` (ou extensão equivalente) por `user_id + local_date + timezone` (única por dia local), com `id` UUIDv7, `source_id`, `version`, `created_at`, `updated_at`, `deleted_at` opcional conforme padrão.
2. **Conteúdo:** texto curto allowlisted (ex.: `reflection_text` <= 2000 chars), opcional; sem campos obrigatórios longos. Não confundir com métricas/fatos.
3. **Data local:** `local_date` (YYYY-MM-DD) calculada no timezone da conta; `timezone` persistido para auditoria/reprodutibilidade. Não usar data UTC do servidor para chave lógica do dia.
4. **Versionamento/conflito:** `version` inteiro, `If-Match`/`version` em mutação, 409 em stale write.
5. **Idempotência:** `Idempotency-Key` em create/upsert; replay seguro conforme padrão de idempotência.
6. **Auditoria:** mutação + `audit_log` no mesmo `db.batch()`.
7. **Privacidade:** dado pessoal sensível; sem log de conteúdo; DTO allowlist; no-store. Não enviar a serviços externos.
8. **Sincronização:** API como fonte de verdade quando implementada; cliente pode fazer upsert idempotente do rascunho local após login/sincronização, com confirmação/merge explícito para evitar sobrescrita silenciosa.
9. **Compatibilidade com revisão semanal:** diária não substitui semanal; revisão semanal pode referenciar existência de reflexões diárias como evidência/ponteiro, sem duplicar conteúdo.

## Alternativas consideradas

- Reusar `weekly_reviews.reflections`: rejeitado para diária (granularidade e semântica diferentes).
- Persistir apenas no backend sem rascunho local: piora offline/atrito; não necessário.
- Sincronizar automaticamente sem controle de conflito: risco de sobrescrita silenciosa.

## Consequências

- Positivas se implementada: persistência cross-device, auditoria, backup/restore alinhados.
- Negativas: nova tabela/contrato/migração/testes; precisa de cuidado com merge de rascunho local.
- Estado atual: sem custo, sem migração, sem risco de backend; limitação de sincronização explicitada na UI.

## Fora do escopo

IA resumindo reflexões, compartilhamento, análise psicológica automática, execução automática de recomendações.
