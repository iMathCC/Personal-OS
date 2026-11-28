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

const fields: readonly FieldDef[] = [
  { key: 'date', label: 'Data', type: 'date', required: true },
  { key: 'taskId', label: 'ID da tarefa', nullable: true },
  { key: 'projectId', label: 'ID do projeto', nullable: true },
  { key: 'areaId', label: 'ID da área', nullable: true },
  {
    key: 'startAt',
    label: 'Início (ISO UTC sem fuso)',
    nullable: true,
    placeholder: '2026-11-22T09:00:00.000Z',
  },
  {
    key: 'endAt',
    label: 'Fim (ISO UTC sem fuso)',
    nullable: true,
    placeholder: '2026-11-22T10:30:00.000Z',
  },
  {
    key: 'durationMinutes',
    label: 'Duração (minutos)',
    type: 'number',
    nullable: true,
    help: 'Obrigatória se não informar intervalo completo.',
  },
  { key: 'note', label: 'Observação', type: 'textarea', nullable: true },
  { key: 'externalId', label: 'ID externo', nullable: true },
];

const columns: readonly ColumnDef[] = [
  { key: 'id', label: 'ID', format: (value) => String(value).slice(0, 8) },
  { key: 'date', label: 'Data' },
  {
    key: 'taskId',
    label: 'Tarefa',
    format: (value) => (value === null ? '—' : String(value).slice(0, 8)),
  },
  {
    key: 'projectId',
    label: 'Projeto',
    format: (value) => (value === null ? '—' : String(value).slice(0, 8)),
  },
  { key: 'durationMinutes', label: 'Duração', format: (value) => formatMinutes(Number(value)) },
];

export function TimePage() {
  const [period, setPeriod] = useDefaultPeriod();
  const summary = useLifeResource(
    (signal) => lifeApi.timeSummary(period, signal),
    [period.from, period.to],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Áreas da vida · tempo"
        title="Tempo observado"
        description="Registro manual ou importado de tempo. Capacidade configurada e tempo efetivo são grandezas distintas; não há monitoramento automático do sistema."
      />
      <PeriodControls period={period} onChange={setPeriod} />
      <SummaryView state={summary}>
        {(data) => (
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Tempo observado" value={formatMinutes(data.observedMinutes)} />
              <Metric label="Estimativa comparável" value={formatMinutes(data.estimatedMinutes)} />
              <Metric
                label="Diferença"
                value={
                  data.differenceMinutes === null
                    ? 'desconhecida'
                    : formatMinutes(Math.abs(data.differenceMinutes))
                }
                hint={
                  data.differenceMinutes === null
                    ? undefined
                    : data.differenceMinutes < 0
                      ? 'abaixo da estimativa'
                      : 'acima da estimativa'
                }
              />
              <Metric
                label="Cobertura"
                value={formatRatio(data.coverage.coverageRatio)}
                hint={`${data.overlappingPairs} sobreposição(ões) sinalizada(s)`}
              />
            </div>
            {data.duplicateIntervalsIgnored > 0 && (
              <p className="mt-4 text-xs text-primary">
                {data.duplicateIntervalsIgnored} intervalo(s) idêntico(s) ignorado(s) no resumo;
                nenhum registro foi apagado.
              </p>
            )}
            <p className="mt-4 text-xs text-muted-foreground">Algoritmo: {data.algorithmVersion}</p>
            <Limitations items={data.limitations} />
          </div>
        )}
      </SummaryView>
      <LifeRecordPanel
        domain="time_entries"
        title="Registros de tempo"
        description="Preencha duração ou início e fim. Intervalos idênticos não são somados duas vezes e sobreposições são sinalizadas."
        fields={fields}
        columns={columns}
        period={period}
      />
    </div>
  );
}
