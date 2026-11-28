import { useEffect, useState } from 'react';
import type { SaveCapacityProfileRequest } from '@personal-os/shared';
import { ErrorPanel } from '@/components/states';
import { Button } from '@/components/ui/button';
import { planningApi } from '@/lib/api';
import { FIELD_CLASS, TEXTAREA_CLASS } from './fields';
import { arrayToLines, formatDate, formatMinutes, linesToArray } from './format';
import { PageHeader, ResourceView } from './ui';
import {
  failureMessage,
  newIdempotencyKey,
  usePlanningDashboard,
  usePlanningResource,
} from './use-planning';

interface AllocationLine {
  areaId: string;
  percent: string;
}

interface UnavailabilityLine {
  from: string;
  to: string;
  minutesPerDay: string;
  reason: string;
}

export function CapacityPage() {
  const dashboard = usePlanningDashboard();
  const profile = usePlanningResource((signal) => planningApi.capacityProfile(signal));
  const capacity = usePlanningResource((signal) => planningApi.capacity(undefined, signal));
  const [weeklyMinutes, setWeeklyMinutes] = useState('2400');
  const [contingency, setContingency] = useState('10');
  const [allocations, setAllocations] = useState<AllocationLine[]>([]);
  const [unavailability, setUnavailability] = useState<UnavailabilityLine[]>([]);
  const [preferences, setPreferences] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- sincroniza formulário com perfil carregado */
  useEffect(() => {
    const current = profile.data;
    setWeeklyMinutes(
      current === null || current === undefined ? '2400' : String(current.weeklyMinutes),
    );
    setContingency(
      current === null || current === undefined ? '10' : String(current.contingencyPercent),
    );
    setAllocations(
      current === undefined || current === null
        ? []
        : current.allocations.map((item) => ({
            areaId: item.areaId,
            percent: String(item.percent),
          })),
    );
    setPreferences(
      current === undefined || current === null ? '' : arrayToLines(current.preferences),
    );
    setUnavailability(
      current === undefined || current === null
        ? []
        : current.unavailability.map((item) => ({
            from: item.from,
            to: item.to,
            minutesPerDay: item.minutesPerDay === null ? '' : String(item.minutesPerDay),
            reason: item.reason ?? '',
          })),
    );
  }, [profile.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const body: SaveCapacityProfileRequest = {
        weeklyMinutes: Number(weeklyMinutes),
        contingencyPercent: Number(contingency),
        allocations: allocations
          .filter((item) => item.areaId !== '')
          .map((item) => ({ areaId: item.areaId, percent: Number(item.percent) })),
        preferences: linesToArray(preferences),
        unavailability: unavailability
          .filter((item) => item.from !== '' && item.to !== '')
          .map((item) => ({
            from: item.from,
            to: item.to,
            ...(item.minutesPerDay === '' ? {} : { minutesPerDay: Number(item.minutesPerDay) }),
            ...(item.reason.trim() === '' ? {} : { reason: item.reason.trim() }),
          })),
      };
      await planningApi.saveCapacityProfile(body, newIdempotencyKey(), profile.data?.version);
      setMessage(
        'Perfil de capacidade salvo; a versão anterior foi preservada no histórico de auditoria.',
      );
      profile.reload();
      capacity.reload();
      dashboard.reload();
    } catch (cause: unknown) {
      setError(failureMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Capacidade"
        title="Capacidade configurada versus observada"
        description="A capacidade é configurada manualmente; compromissos usam estimativas informadas. O sistema não inventa tempo executado, mostra cobertura parcial e reserva margem para imprevistos."
      />

      {message !== null && (
        <p role="status" className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
          {message}
        </p>
      )}
      {error !== null && <ErrorPanel title="Não foi possível salvar" message={error} />}

      <ResourceView state={capacity} loadingLabel="Calculando capacidade…">
        {(data) => (
          <section
            aria-label="Capacidade da semana"
            className="rounded-xl border border-border bg-card p-5"
          >
            <h3 className="text-base font-semibold">
              Semana de {formatDate(data.weekStart)} a {formatDate(data.weekEnd)}
            </h3>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Configurada</dt>
                <dd>{formatMinutes(data.configuredMinutes)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Reserva</dt>
                <dd>{formatMinutes(data.contingencyMinutes)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Indisponibilidade</dt>
                <dd>{formatMinutes(data.unavailableMinutes)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Disponível</dt>
                <dd>{formatMinutes(data.availableMinutes)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Comprometida (estimativas)</dt>
                <dd>{formatMinutes(data.committedMinutes)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Restante / sobrecarga</dt>
                <dd>
                  {formatMinutes(data.remainingMinutes)}
                  {data.overloadMinutes > 0 && ` · +${formatMinutes(data.overloadMinutes)}`}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Cobertura das estimativas</dt>
                <dd>
                  {Math.round(data.coverage * 100)}% ({data.estimatedTaskCount} estimadas,{' '}
                  {data.unestimatedTaskCount} sem estimativa)
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Tarefas ignoradas</dt>
                <dd>
                  {data.skippedCompletedCount} concluídas · {data.skippedCancelledCount} canceladas
                  · {data.blockedTaskCount} bloqueadas
                </dd>
              </div>
            </dl>
            {data.byArea.length > 0 && (
              <div
                tabIndex={0}
                role="region"
                aria-label="Tabela de capacidade por área; use o teclado para rolar"
                className="mt-4 overflow-x-auto focus-visible:ring-2 focus-visible:ring-ring"
              >
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-2">
                        Área
                      </th>
                      <th scope="col" className="py-2">
                        Alocada
                      </th>
                      <th scope="col" className="py-2">
                        Comprometida
                      </th>
                      <th scope="col" className="py-2">
                        Restante
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.byArea.map((area) => (
                      <tr key={area.areaId}>
                        <td className="py-2">{area.areaId}</td>
                        <td className="py-2">{formatMinutes(area.allocatedMinutes)}</td>
                        <td className="py-2">{formatMinutes(area.committedMinutes)}</td>
                        <td className="py-2">{formatMinutes(area.remainingMinutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.warnings.length > 0 && (
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {data.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Algoritmo {data.algorithmVersion} — sem tempo real executado disponível.
            </p>
          </section>
        )}
      </ResourceView>

      <ResourceView state={dashboard}>
        {(data) => (
          <section
            aria-label="Configurar capacidade"
            className="rounded-xl border border-border bg-card p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold">Configuração semanal</h3>
              {profile.data !== null && profile.data !== undefined && (
                <span className="text-xs text-muted-foreground">
                  v{profile.data.version} · {formatDate(profile.data.createdAt.slice(0, 10))}
                </span>
              )}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                Minutos disponíveis por semana
                <input
                  className={FIELD_CLASS}
                  type="number"
                  min={0}
                  max={10_000}
                  value={weeklyMinutes}
                  onChange={(event) => setWeeklyMinutes(event.target.value)}
                />
              </label>
              <label className="text-sm">
                Reserva para imprevistos (%)
                <input
                  className={FIELD_CLASS}
                  type="number"
                  min={0}
                  max={50}
                  step="0.5"
                  value={contingency}
                  onChange={(event) => setContingency(event.target.value)}
                />
              </label>
            </div>
            <div className="mt-4">
              <p className="text-sm font-medium">Distribuição por área (%)</p>
              {allocations.map((item, index) => (
                <div key={index} className="mt-2 flex flex-wrap gap-2">
                  <select
                    className={FIELD_CLASS}
                    value={item.areaId}
                    aria-label={`Área ${index + 1}`}
                    onChange={(event) =>
                      setAllocations((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, areaId: event.target.value } : row,
                        ),
                      )
                    }
                  >
                    <option value="">Selecione…</option>
                    {data.availableAreas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className={FIELD_CLASS}
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    aria-label={`Percentual ${index + 1}`}
                    value={item.percent}
                    onChange={(event) =>
                      setAllocations((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, percent: event.target.value } : row,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setAllocations((current) =>
                        current.filter((_, rowIndex) => rowIndex !== index),
                      )
                    }
                  >
                    Remover
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="mt-2 min-h-11"
                onClick={() =>
                  setAllocations((current) => [...current, { areaId: '', percent: '0' }])
                }
              >
                Adicionar área
              </Button>
            </div>
            <div className="mt-4">
              <p className="text-sm font-medium">Indisponibilidades</p>
              {unavailability.map((item, index) => (
                <div key={index} className="mt-2 grid gap-2 sm:grid-cols-4">
                  <input
                    className={FIELD_CLASS}
                    type="date"
                    aria-label={`Início ${index + 1}`}
                    value={item.from}
                    onChange={(event) =>
                      setUnavailability((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, from: event.target.value } : row,
                        ),
                      )
                    }
                  />
                  <input
                    className={FIELD_CLASS}
                    type="date"
                    aria-label={`Fim ${index + 1}`}
                    value={item.to}
                    onChange={(event) =>
                      setUnavailability((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, to: event.target.value } : row,
                        ),
                      )
                    }
                  />
                  <input
                    className={FIELD_CLASS}
                    type="number"
                    min={0}
                    max={1440}
                    aria-label={`Minutos por dia ${index + 1}`}
                    placeholder="min/dia"
                    value={item.minutesPerDay}
                    onChange={(event) =>
                      setUnavailability((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, minutesPerDay: event.target.value } : row,
                        ),
                      )
                    }
                  />
                  <input
                    className={FIELD_CLASS}
                    aria-label={`Motivo ${index + 1}`}
                    placeholder="Motivo (opcional)"
                    value={item.reason}
                    onChange={(event) =>
                      setUnavailability((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, reason: event.target.value } : row,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="sm:col-span-4"
                    onClick={() =>
                      setUnavailability((current) =>
                        current.filter((_, rowIndex) => rowIndex !== index),
                      )
                    }
                  >
                    Remover período
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="mt-2 min-h-11"
                onClick={() =>
                  setUnavailability((current) => [
                    ...current,
                    { from: '', to: '', minutesPerDay: '', reason: '' },
                  ])
                }
              >
                Adicionar período
              </Button>
            </div>
            <label className="mt-4 block text-sm">
              Preferências / observações (opcionais)
              <textarea
                className={TEXTAREA_CLASS}
                value={preferences}
                onChange={(event) => setPreferences(event.target.value)}
                placeholder="Preferências (uma por linha); não alteram o cálculo."
              />
            </label>
            <Button
              type="button"
              className="mt-4 min-h-11"
              disabled={busy}
              onClick={() => void save()}
            >
              Salvar capacidade
            </Button>
          </section>
        )}
      </ResourceView>
    </div>
  );
}
