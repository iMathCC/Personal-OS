# ADR-0010 — Exportação aberta e backups

- **Status:** Aceito
- **Data:** 2026-11-20
- **Relacionados:** DATA_MODEL, SECURITY, ROADMAP

## Contexto

“Dados sob controle do usuário” e migração futura exigem exportação/restauração confiáveis. D1 Time Travel (7 dias no free) não é backup do usuário. R2 é opcional e pode exigir perfil de faturamento.

## Decisão

- **Export completo JSON** versionado, com `exportVersion`, `schemaVersion`, counts, checksum e todos os dados de domínio (sem segredos/sessões).
- **CSV por módulo** para interoperabilidade.
- **Restauração** validada por dry-run, aplicada atomicamente, em banco vazio na v1.
- **Backup automático semanal** para R2 privado **somente se habilitado**; retenção de 8 semanas; URLs assinadas curtas.
- **Fallback sem R2:** lembrete mensal + export manual para o dispositivo.
- Teste de restauração trimestral documentado.
- Time Travel é recuperação operacional, não substitui backup.

## Alternativas consideradas

| Alternativa | Prós | Contras |
| --- | --- | --- |
| Só D1 Time Travel | Zero esforço | 7 dias; não é exportação; dependente do provedor |
| Só export manual | Simples, sem cartão | Depende de disciplina; risco de perda |
| R2 automático | Backup confiável | Pode exigir cartão; mais um serviço |
| Backup em Git | Versionado | Dados sensíveis no Git; limites de repo; nunca |
| Criptografia ponta a ponta no backup | Mais seguro | Complexidade de chaves/recuperação; adiado |

## Consequências

**Positivas:** portabilidade real, recuperação testável, baixo custo, usuário no controle.

**Negativas/riscos:** export pode conter dados sensíveis (avisar); restore em banco vazio não cobre merge; backup automático depende de R2/cartão; teste trimestral exige disciplina.

## Critérios de revisão

- Necessidade de merge/restauração parcial.
- Adoção de criptografia de backup.
- Volume de dados que exija export em streaming/partes.
