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
import { formatRatio, useDefaultPeriod, useLifeResource } from './shared-helpers';

const metricFields: readonly FieldDef[] = [
  { key: 'key', label: 'Chave', required: true, placeholder: 'sono_horas' },
  { key: 'label', label: 'Rótulo', required: true, placeholder: 'Sono' },
  { key: 'unit', label: 'Unidade', required: true, placeholder: 'horas' },
  {
    key: 'valueKind',
    label: 'Tipo de valor',
    type: 'select',
    options: [
      { value: 'integer', label: 'Inteiro' },
      { value: 'scale', label: 'Escala' },
    ],
  },
  { key: 'externalId', label: 'ID externo', nullable: true },
];

const observationFields: readonly FieldDef[] = [
  {
    key: 'metricId',
    label: 'ID da métrica',
    required: true,
    help: 'Copie o ID da métrica na lista.',
  },
  { key: 'date', label: 'Data', type: 'date', required: true },
  { key: 'value', label: 'Valor inteiro', type: 'number', required: true },
  { key: 'note', label: 'Observação', type: 'textarea', nullable: true },
  { key: 'externalId', label: 'ID externo', nullable: true },
];

const commonColumns: readonly ColumnDef[] = [
  { key: 'id', label: 'ID', format: (value) => String(value).slice(0, 8) },
];

export function HealthPage() {
  const [period, setPeriod] = useDefaultPeriod();
  const [tab, setTab] = useState<'summary' | 'metrics' | 'observations'>('summary');
  const summary = useLifeResource(
    (signal) => lifeApi.healthSummary(period, signal),
    [period.from, period.to],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Áreas da vida · saúde"
        title="Saúde observada"
        description="Registros informados por você, sem diagnóstico, interpretação clínica ou recomendação automática. Sensibilidade reforçada e ausência de valor permanece desconhecida."
      />
      <PeriodControls period={period} onChange={setPeriod} />
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['summary', 'Resumo'],
            ['metrics', 'Métricas'],
            ['observations', 'Observações'],
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
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Métricas com dados" value={String(data.metrics.length)} />
                <Metric
                  label="Observações no período"
                  value={String(data.coverage.observationCount)}
                  hint={`${data.coverage.daysWithRecords} dia(s) com registro`}
                />
                <Metric label="Cobertura" value={formatRatio(data.coverage.coverageRatio)} />
              </div>
              {data.metrics.length > 0 && (
                <div
                  tabIndex={0}
                  role="region"
                  aria-label="Tabela de métricas de saúde; use o teclado para rolar"
                  className="mt-5 overflow-x-auto focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="py-2">Métrica</th>
                        <th className="py-2">Observações</th>
                        <th className="py-2">Último valor</th>
                        <th className="py-2">Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.metrics.map((metric) => (
                        <tr key={metric.metricKey} className="border-b border-border/60 text-xs">
                          <td className="py-2">{metric.metricKey}</td>
                          <td className="py-2 tabular-nums">{metric.observationCount}</td>
                          <td className="py-2 tabular-nums">
                            {metric.latestValue ?? 'desconhecido'}
                          </td>
                          <td className="py-2">{metric.latestDate ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                Algoritmo: {data.algorithmVersion}
              </p>
              <Limitations items={data.limitations} />
            </div>
          )}
        </SummaryView>
      )}

      {tab === 'metrics' && (
        <LifeRecordPanel
          domain="health_metrics"
          title="Métricas"
          description="Métricas são definidas pelo usuário; o aplicativo não infere condições de saúde."
          fields={metricFields}
          columns={[
            ...commonColumns,
            { key: 'key', label: 'Chave' },
            { key: 'label', label: 'Rótulo' },
            { key: 'unit', label: 'Unidade' },
            { key: 'valueKind', label: 'Tipo' },
          ]}
          period={period}
        />
      )}
      {tab === 'observations' && (
        <LifeRecordPanel
          domain="health_observations"
          title="Observações"
          description="Cada registro informa data, valor inteiro e proveniência. Notas são preservadas no histórico."
          fields={observationFields}
          columns={[
            ...commonColumns,
            { key: 'date', label: 'Data' },
            {
              key: 'metricId',
              label: 'ID da métrica',
              format: (value) => String(value).slice(0, 8),
            },
            { key: 'value', label: 'Valor' },
          ]}
          period={period}
        />
      )}
    </div>
  );
}
