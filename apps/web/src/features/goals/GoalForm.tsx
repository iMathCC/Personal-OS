import { useState, type FormEvent } from 'react';
import type {
  CreateLifeGoalRequest,
  GoalAreaDto,
  LifeGoalDto,
  UpdateGoalRequest,
} from '@personal-os/shared';
import { Button } from '@/components/ui/button';

const FIELD_CLASS = 'mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3';

interface GoalFormProps {
  areas: readonly GoalAreaDto[];
  /** `null` cria um objetivo; um objetivo existente habilita a edição. */
  goal: LifeGoalDto | null;
  busy: boolean;
  onSave: (input: CreateLifeGoalRequest | UpdateGoalRequest) => Promise<boolean>;
  onCancel: () => void;
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function optionalDate(value: string): string | null {
  return value === '' ? null : value;
}

export function GoalForm({ areas, goal, busy, onSave, onCancel }: GoalFormProps) {
  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [areaKey, setAreaKey] = useState(goal?.areaKey ?? areas[0]?.key ?? '');
  const [horizon, setHorizon] = useState<LifeGoalDto['horizon']>(goal?.horizon ?? 'medium');
  const [priority, setPriority] = useState(goal?.priority ?? 3);
  const [status, setStatus] = useState<'draft' | 'active'>(
    goal?.status === 'draft' ? 'draft' : 'active',
  );
  const [startDate, setStartDate] = useState(goal?.startDate ?? '');
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '');
  const [successCriteria, setSuccessCriteria] = useState(goal?.successCriteria ?? '');
  const [progressMode, setProgressMode] = useState<LifeGoalDto['progressMode']>(
    goal?.progressMode ?? 'manual',
  );
  const [manualProgress, setManualProgress] = useState(goal?.manualProgress?.toString() ?? '');

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const progress =
      progressMode === 'manual' || progressMode === 'hybrid'
        ? manualProgress === ''
          ? null
          : Number(manualProgress)
        : null;

    if (goal === null) {
      const input: CreateLifeGoalRequest = {
        areaKey,
        title: title.trim(),
        description: optionalText(description),
        horizon,
        status,
        priority,
        startDate: optionalDate(startDate),
        targetDate: optionalDate(targetDate),
        successCriteria: optionalText(successCriteria),
        progressMode,
        manualProgress: progress,
      };
      const saved = await onSave(input);
      if (saved) {
        setTitle('');
        setDescription('');
        setSuccessCriteria('');
        setStartDate('');
        setTargetDate('');
        setManualProgress('');
      }
      return;
    }

    const input: UpdateGoalRequest = {
      title: title.trim(),
      description: optionalText(description),
      horizon,
      priority,
      startDate: optionalDate(startDate),
      targetDate: optionalDate(targetDate),
      successCriteria: optionalText(successCriteria),
      progressMode,
      manualProgress: progress,
    };
    await onSave(input);
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm sm:col-span-2">
        <span className="text-muted-foreground">Título</span>
        <input
          required
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={FIELD_CLASS}
        />
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Área</span>
        {goal === null ? (
          <select
            required
            value={areaKey}
            onChange={(event) => setAreaKey(event.target.value)}
            className={FIELD_CLASS}
          >
            {areas.map((area) => (
              <option key={area.id} value={area.key}>
                {area.name}
              </option>
            ))}
          </select>
        ) : (
          <input readOnly value={goal.areaName} className={`${FIELD_CLASS} opacity-70`} />
        )}
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Horizonte</span>
        <select
          value={horizon}
          onChange={(event) => setHorizon(event.target.value as LifeGoalDto['horizon'])}
          className={FIELD_CLASS}
        >
          <option value="short">Curto prazo</option>
          <option value="medium">Médio prazo</option>
          <option value="long">Longo prazo</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Prioridade (1 a 5)</span>
        <select
          value={priority}
          onChange={(event) => setPriority(Number(event.target.value))}
          className={FIELD_CLASS}
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      {goal === null && (
        <label className="block text-sm">
          <span className="text-muted-foreground">Situação inicial</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as 'draft' | 'active')}
            className={FIELD_CLASS}
          >
            <option value="active">Ativo</option>
            <option value="draft">Rascunho</option>
          </select>
        </label>
      )}
      <label className="block text-sm">
        <span className="text-muted-foreground">Início</span>
        <input
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          className={FIELD_CLASS}
        />
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Prazo</span>
        <input
          type="date"
          min={startDate}
          value={targetDate}
          onChange={(event) => setTargetDate(event.target.value)}
          className={FIELD_CLASS}
        />
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Modo de progresso</span>
        <select
          value={progressMode}
          onChange={(event) => setProgressMode(event.target.value as LifeGoalDto['progressMode'])}
          className={FIELD_CLASS}
        >
          <option value="manual">Manual</option>
          <option value="metrics">Métricas</option>
          <option value="tasks">Marcos</option>
          <option value="hybrid">Híbrido</option>
        </select>
      </label>
      {(progressMode === 'manual' || progressMode === 'hybrid') && (
        <label className="block text-sm">
          <span className="text-muted-foreground">Progresso manual (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={manualProgress}
            onChange={(event) => setManualProgress(event.target.value)}
            className={FIELD_CLASS}
          />
        </label>
      )}
      <label className="block text-sm sm:col-span-2">
        <span className="text-muted-foreground">Descrição</span>
        <textarea
          rows={3}
          maxLength={2000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="text-muted-foreground">Critério de sucesso</span>
        <textarea
          rows={3}
          maxLength={2000}
          value={successCriteria}
          onChange={(event) => setSuccessCriteria(event.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" disabled={busy || areas.length === 0} className="min-h-11">
          {goal === null ? 'Criar objetivo' : 'Salvar alterações'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="min-h-11">
          Cancelar
        </Button>
      </div>
    </form>
  );
}
