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
  { key: 'activityType', label: 'Atividade', required: true, placeholder: 'corrida' },
  { key: 'date', label: 'Data', type: 'date', required: true },
  { key: 'durationMinutes', label: 'Duração (minutos)', type: 'number', required: true },
  { key: 'volume', label: 'Volume', type: 'number', nullable: true },
  { key: 'distanceMeters', label: 'Distância (metros)', type: 'number', nullable: true },
  { key: 'intensity', label: 'Intensidade (1 a 10)', type: 'number', nullable: true },
  { key: 'note', label: 'Observação', type: 'textarea', nullable: true },
  { key: 'externalId', label: 'ID externo', nullable: true },
];

const columns: readonly ColumnDef[] = [
  { key: 'id', label: 'ID', format: (value) => String(value).slice(0, 8) },
  { key: 'date', label: 'Data' },
  { key: 'activityType', label: 'Atividade' },
  { key: 'durationMinutes', label: 'Duração', format: (value) => formatMinutes(Number(value)) },
  { key: 'volume', label: 'Volume' },
];

export function TrainingPage() {
  const [period, setPeriod] = useDefaultPeriod();
  const summary = useLifeResource(
    (signal) => lifeApi.trainingSummary(period, signal),
    [period.from, period.to],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Áreas da vida · treinamento"
        title="Treinamento registrado"
        description="Sessões observadas, sem prescrição de treino nem recomendação médica. Volume e distância ausentes ficam fora da soma."
      />
      <PeriodControls period={period} onChange={setPeriod} />
      <SummaryView state={summary}>
        {(data) => (
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Sessões" value={String(data.sessionCount)} />
              <Metric label="Tempo total" value={formatMinutes(data.durationMinutes)} />
              <Metric label="Distância" value={`${Math.round(data.distanceMeters / 1000)} km`} />
              <Metric
                label="Consistência semanal"
                value={formatRatio(data.consistencyRatio)}
                hint={`${data.weeksWithRecords} semana(s) com registro`}
              />
            </div>
            {data.byActivity.length > 0 && (
              <div
                tabIndex={0}
                role="region"
                aria-label="Tabela de treinos; use o teclado para rolar"
                className="mt-5 overflow-x-auto focus-visible:ring-2 focus-visible:ring-ring"
              >
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="py-2">Atividade</th>
                      <th className="py-2">Sessões</th>
                      <th className="py-2">Duração</th>
                      <th className="py-2">Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byActivity.map((row) => (
                      <tr key={row.activityType} className="border-b border-border/60 text-xs">
                        <td className="py-2">{row.activityType}</td>
                        <td className="py-2 tabular-nums">{row.sessionCount}</td>
                        <td className="py-2">{formatMinutes(row.durationMinutes)}</td>
                        <td className="py-2 tabular-nums">{row.volume}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-4 text-xs text-muted-foreground">Algoritmo: {data.algorithmVersion}</p>
            <Limitations items={data.limitations} />
          </div>
        )}
      </SummaryView>
      <LifeRecordPanel
        domain="training_sessions"
        title="Sessões"
        description="Registre cada sessão com atividade, data e duração. Correções geram nova versão preservando a anterior."
        fields={fields}
        columns={columns}
        period={period}
      />
    </div>
  );
}
