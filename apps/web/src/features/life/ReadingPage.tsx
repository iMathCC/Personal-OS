import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { lifeApi } from '@/lib/api';
import {
  LifeRecordPanel,
  Limitations,
  Metric,
  PageHeader,
  PeriodControls,
  SummaryView,
  type ColumnDef,
  type FieldDef,
} from './shared';
import { formatMinutes, formatRatio, useDefaultPeriod, useLifeResource } from './shared-helpers';

const materialFields: readonly FieldDef[] = [
  { key: 'title', label: 'Título', required: true },
  { key: 'author', label: 'Autor', nullable: true },
  {
    key: 'kind',
    label: 'Tipo',
    type: 'select',
    options: [
      { value: 'book', label: 'Livro' },
      { value: 'article', label: 'Artigo' },
      { value: 'material', label: 'Material' },
    ],
  },
  {
    key: 'status',
    label: 'Situação da leitura',
    type: 'select',
    options: [
      { value: 'planned', label: 'Planejado' },
      { value: 'reading', label: 'Lendo' },
      { value: 'finished', label: 'Concluído' },
      { value: 'paused', label: 'Pausado' },
    ],
  },
  { key: 'totalPages', label: 'Total de páginas', type: 'number', nullable: true },
  { key: 'goalId', label: 'ID da meta vinculada', nullable: true },
  { key: 'courseId', label: 'ID do curso vinculado', nullable: true },
  { key: 'externalId', label: 'ID externo', nullable: true },
];

const sessionFields: readonly FieldDef[] = [
  { key: 'materialId', label: 'ID do material', required: true },
  { key: 'date', label: 'Data', type: 'date', required: true },
  { key: 'minutes', label: 'Minutos', type: 'number', nullable: true },
  { key: 'pagesRead', label: 'Páginas lidas', type: 'number', nullable: true },
  { key: 'note', label: 'Observação', type: 'textarea', nullable: true },
  { key: 'externalId', label: 'ID externo', nullable: true },
];

const noteFields: readonly FieldDef[] = [
  { key: 'materialId', label: 'ID do material', required: true },
  { key: 'date', label: 'Data', type: 'date', required: true },
  {
    key: 'kind',
    label: 'Tipo',
    type: 'select',
    options: [
      { value: 'note', label: 'Nota' },
      { value: 'learning', label: 'Aprendizado' },
    ],
  },
  { key: 'content', label: 'Conteúdo', type: 'textarea', required: true },
  { key: 'externalId', label: 'ID externo', nullable: true },
];

const commonColumns: readonly ColumnDef[] = [
  { key: 'id', label: 'ID', format: (value) => String(value).slice(0, 8) },
];

export function ReadingPage() {
  const [period, setPeriod] = useDefaultPeriod();
  const [tab, setTab] = useState<'summary' | 'materials' | 'sessions' | 'notes'>('summary');
  const summary = useLifeResource(
    (signal) => lifeApi.readingSummary(period, signal),
    [period.from, period.to],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Áreas da vida · leitura"
        title="Leitura e aprendizados"
        description="Leitura, estudo estruturado e nota pessoal são conceitos distintos. Registros de aprendizado não implicam retenção."
      />
      <PeriodControls period={period} onChange={setPeriod} />
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['summary', 'Resumo'],
            ['materials', 'Materiais'],
            ['sessions', 'Sessões'],
            ['notes', 'Notas'],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            variant={tab === key ? 'default' : 'outline'}
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === 'summary' && (
        <SummaryView state={summary}>
          {(data) => (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Iniciados" value={String(data.started)} />
                <Metric label="Concluídos" value={String(data.finished)} />
                <Metric label="Tempo de leitura" value={formatMinutes(data.minutes)} />
                <Metric label="Páginas lidas" value={String(data.pagesRead)} />
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Algoritmo: {data.algorithmVersion} · cobertura{' '}
                {formatRatio(data.coverage.coverageRatio)}.
              </p>
              <Limitations items={data.limitations} />
            </div>
          )}
        </SummaryView>
      )}

      {tab === 'materials' && (
        <LifeRecordPanel
          domain="reading_materials"
          title="Materiais"
          description="Livros, artigos e materiais planejados, em leitura, pausados ou concluídos."
          fields={materialFields}
          columns={[
            ...commonColumns,
            { key: 'title', label: 'Título' },
            { key: 'author', label: 'Autor' },
            { key: 'status', label: 'Situação' },
            { key: 'totalPages', label: 'Páginas' },
          ]}
          period={period}
        />
      )}
      {tab === 'sessions' && (
        <LifeRecordPanel
          domain="reading_sessions"
          title="Sessões de leitura"
          description="Minutos e páginas lidas por data, com ausência explícita quando não informados."
          fields={sessionFields}
          columns={[
            ...commonColumns,
            { key: 'date', label: 'Data' },
            { key: 'materialId', label: 'Material', format: (value) => String(value).slice(0, 8) },
            { key: 'minutes', label: 'Minutos' },
            { key: 'pagesRead', label: 'Páginas' },
          ]}
          period={period}
        />
      )}
      {tab === 'notes' && (
        <LifeRecordPanel
          domain="reading_notes"
          title="Notas e aprendizados"
          description="Texto pessoal sensível: não é enviado a serviços externos nem usado para gerar números oficiais."
          fields={noteFields}
          columns={[
            ...commonColumns,
            { key: 'date', label: 'Data' },
            { key: 'kind', label: 'Tipo' },
            { key: 'content', label: 'Conteúdo' },
          ]}
          period={period}
        />
      )}
    </div>
  );
}
