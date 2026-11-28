import { useState } from 'react';
import type { ImportPreviewDto, ImportReportDto, LifeDomainDto } from '@personal-os/shared';
import { Button } from '@/components/ui/button';
import { lifeApi } from '@/lib/api';
import { PageHeader } from './shared';
import { failureMessage, idempotencyKeyFor, useLifeResource } from './shared-helpers';

const DOMAINS: readonly { value: LifeDomainDto; label: string }[] = [
  { value: 'finance_accounts', label: 'Contas financeiras' },
  { value: 'finance_categories', label: 'Categorias financeiras' },
  { value: 'finance_transactions', label: 'Transações' },
  { value: 'finance_balance_items', label: 'Patrimônio e dívidas' },
  { value: 'health_metrics', label: 'Métricas de saúde' },
  { value: 'health_observations', label: 'Observações de saúde' },
  { value: 'training_sessions', label: 'Sessões de treinamento' },
  { value: 'reading_materials', label: 'Materiais de leitura' },
  { value: 'reading_sessions', label: 'Sessões de leitura' },
  { value: 'reading_notes', label: 'Notas de leitura' },
  { value: 'time_entries', label: 'Registros de tempo' },
];

export function ImportsPage() {
  const [domain, setDomain] = useState<LifeDomainDto>('finance_transactions');
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewDto | null>(null);
  const [report, setReport] = useState<ImportReportDto | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [commitKey, setCommitKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const batches = useLifeResource((signal) => lifeApi.imports(50, signal), []);

  function invalidateDraft(): void {
    setPreview(null);
    setReport(null);
    setConfirmed(false);
    setCommitKey(null);
  }

  async function loadFile(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    setError(null);
    invalidateDraft();
    setFileName(file.name);
    setFormat(file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv');
    setContent(await file.text());
  }

  async function doPreview(): Promise<void> {
    setBusy(true);
    setError(null);
    setReport(null);
    setConfirmed(false);
    setCommitKey(null);
    try {
      setPreview(await lifeApi.previewImport({ domain, format, content }));
    } catch (cause: unknown) {
      setError(failureMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function doCommit(): Promise<void> {
    setBusy(true);
    setError(null);
    const key = idempotencyKeyFor(commitKey);
    setCommitKey(key);
    try {
      setReport(
        await lifeApi.commitImport(
          {
            domain,
            format,
            content,
            ...(fileName === null ? {} : { fileName }),
            confirm: true,
          },
          key,
        ),
      );
      setConfirmed(false);
      setCommitKey(null);
      batches.reload();
    } catch (cause: unknown) {
      setError(failureMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Áreas da vida · importações"
        title="Importação controlada"
        description="Pré-visualize, valide, deduplique e confirme explicitamente. O arquivo é processado localmente, sem execução de fórmulas, código ou markup; linhas inválidas nunca são gravadas como válidas."
      />

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs text-muted-foreground">
            Domínio
            <select
              className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={domain}
              onChange={(event) => {
                setDomain(event.target.value as LifeDomainDto);
                invalidateDraft();
              }}
            >
              {DOMAINS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Formato
            <select
              className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={format}
              onChange={(event) => {
                setFormat(event.target.value as 'csv' | 'json');
                invalidateDraft();
              }}
            >
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Arquivo local
            <input
              type="file"
              accept=".csv,.json,text/csv,application/json"
              className="mt-1 min-h-11 w-full text-sm"
              onChange={(event) => void loadFile(event.target.files?.[0])}
            />
          </label>
        </div>
        <label className="mt-4 block text-xs text-muted-foreground">
          Conteúdo (máximo 12.000 bytes e 200 linhas)
          <textarea
            className="mt-1 min-h-48 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              invalidateDraft();
            }}
            placeholder={
              format === 'csv' ? 'coluna1,coluna2\nvalor1,valor2' : '[{"coluna":"valor"}]'
            }
          />
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void doPreview()} disabled={busy || content === ''}>
            Pré-visualizar
          </Button>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            Confirmo que revisei os dados e autorizo a gravação
          </label>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void doCommit()}
            disabled={busy || preview === null || !confirmed}
          >
            Confirmar importação
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          A confirmação guarda a chave idempotente da tentativa: uma falha de rede pode ser repetida
          sem duplicar a gravação. Registros duplicados são sinalizados, nunca apagados
          automaticamente.
        </p>
        {error && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </section>

      {preview && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-lg font-semibold">Pré-visualização</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {preview.total} linha(s) · {preview.valid} válida(s) · {preview.invalid} inválida(s) ·{' '}
            {preview.duplicates} duplicada(s)
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Colunas aceitas: {preview.expectedColumns.join(', ')}
          </p>
          <div
            tabIndex={0}
            role="region"
            aria-label="Tabela de importações; use o teclado para rolar"
            className="mt-4 overflow-x-auto focus-visible:ring-2 focus-visible:ring-ring"
          >
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2">Linha</th>
                  <th className="py-2">Situação</th>
                  <th className="py-2">Problemas</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 50).map((row) => (
                  <tr key={row.row} className="border-b border-border/60">
                    <td className="py-2">{row.row}</td>
                    <td className="py-2">{row.status}</td>
                    <td className="py-2">
                      {row.issues.map((issue) => issue.message).join('; ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-4 list-disc pl-5 text-xs text-muted-foreground">
            {preview.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {report && (
        <section className="rounded-xl border border-primary/40 bg-primary/5 p-5" role="status">
          <h3 className="text-lg font-semibold">Importação concluída</h3>
          <p className="mt-2 text-sm">
            {report.imported} registro(s) gravado(s) em {report.domain}; {report.invalid}{' '}
            inválido(s) e {report.duplicates} duplicado(s). Lote: {report.batchId.slice(0, 8)}.
          </p>
        </section>
      )}

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-lg font-semibold">Lotes anteriores</h3>
        {batches.status === 'error' && (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {batches.error ?? 'Falha ao carregar lotes.'}
          </p>
        )}
        {batches.data?.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">Nenhuma importação registrada.</p>
        )}
        {(batches.data?.length ?? 0) > 0 && (
          <div
            tabIndex={0}
            role="region"
            aria-label="Tabela de importações; use o teclado para rolar"
            className="mt-4 overflow-x-auto focus-visible:ring-2 focus-visible:ring-ring"
          >
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2">Data</th>
                  <th className="py-2">Domínio</th>
                  <th className="py-2">Formato</th>
                  <th className="py-2">Importados</th>
                  <th className="py-2">Rejeitados</th>
                </tr>
              </thead>
              <tbody>
                {batches.data?.map((batch) => (
                  <tr key={batch.id} className="border-b border-border/60">
                    <td className="py-2">{batch.createdAt.slice(0, 10)}</td>
                    <td className="py-2">{batch.domain}</td>
                    <td className="py-2">{batch.format}</td>
                    <td className="py-2">{batch.imported}</td>
                    <td className="py-2">{batch.invalid + batch.duplicates}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
