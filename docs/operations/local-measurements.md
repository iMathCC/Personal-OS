# Medições locais — Entrega 6

Medidas feitas em **21/11/2026** contra o Worker local isolado (`wrangler dev --local`, HTTPS autoassinado em `https://localhost:8788`) durante a suíte Playwright completa. Não são medições de produção.

## 1. Método

- Latência de API e contagem de chamadas D1: spans capturados pelo explorer local do Wrangler (`POST /cdn-cgi/local/explorer/api/local/observability/query` sobre a tabela `spans`), agregados por `trace_id`. Foram amostradas 67 requisições HTTP (54 GET, 13 POST) e 163 spans D1.
- Bundle: saída do `vite build` + `vite-plugin-pwa`.
- CPU p95 **não foi medido**: o explorer local reporta duração de spans, não CPU faturável do Workers. O gate da `ROADMAP.md` §7 continua aberto até medição em ambiente publicado.

## 2. Resultados

| Métrica | Valor local | Budget (`ROADMAP.md` §7) | Situação |
| --- | --- | --- | --- |
| Latência HTTP p50 / p95 / máx | 39 ms / 113 ms / 214 ms | p95 < 500 ms (sem rede) | Dentro |
| Duração de span D1 p50 / p95 / máx | 8 ms / 23 ms / 91 ms | — | Referência |
| Spans D1 por requisição p50 / p95 / máx | 1 / 7 / 8 | ≤ 8 | Dentro (no limite) |
| Bundle inicial (JS) | 428,73 kB bruto / **129,86 kB gzip** | ≤ 250 kB gzip | Dentro |
| CSS | 26,77 kB / 5,48 kB gzip | — | Referência |
| PWA | 14 entradas de precache, 510,88 KiB | — | Somente shell; nenhuma resposta de API |

## 3. Interpretação e limitações

- O p95 HTTP de 113 ms inclui o overhead do servidor de desenvolvimento (`wrangler dev`), não representa latência de Workers em produção.
- O máximo de 8 spans D1 em uma requisição atinge exatamente o orçamento; qualquer endpoint novo deve justificar sua query additional antes de ser adicionado.
- O bundle inicial está bem abaixo do limite, mas crescerá quando gráficos ECharts forem adotados (devem entrar como chunk lazy, conforme `AGENTS.md`).
- Medições de CPU faturável, p95 em produção, uso de cotas e Lighthouse em ambiente publicado ficam pendentes de autorização para deploy.

## 4. Comandos para reproduzir

```bash
npm run test:e2e:env -- --reset
# iniciar o Worker local em 8788 conforme instrução impressa pelo script
npm run test:e2e
# consultar spans via /cdn-cgi/local/explorer/api/local/observability/query
npm run build
```
