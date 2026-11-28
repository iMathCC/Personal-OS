import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { PlanPriority } from '@personal-os/shared';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icons';
import { studiesApi, tasksApi } from '@/lib/api';
import { priorityLabel } from '@/features/projects/format';
import { PRIORITY_OPTIONS } from '@/features/projects/use-projects';
import {
  buildQuickStudyInput,
  buildQuickTaskInput,
  type QuickStudyDraft,
  type QuickTaskDraft,
} from './model';

interface CaptureOption {
  readonly id: string;
  readonly title: string;
}

interface QuickCaptureProps {
  readonly today: string;
  readonly timezone: string;
  readonly projects: readonly CaptureOption[];
  readonly goals: readonly CaptureOption[];
  readonly onCreated: () => void;
}

const FIELD_CLASS = 'mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3';
const LINK_CLASS =
  'inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm text-foreground hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Captura tipada: só grava nos módulos cujos contratos existem. Outros registros
 * recebem link para o módulo especializado, sem campo livre genérico.
 */
export function QuickCapture({ today, timezone, projects, goals, onCreated }: QuickCaptureProps) {
  const [taskDraft, setTaskDraft] = useState<QuickTaskDraft>({
    title: '',
    priority: 'medium',
    dueDate: today,
    projectId: '',
    goalId: '',
    estimateMinutes: '',
  });
  const [studyDraft, setStudyDraft] = useState<QuickStudyDraft>({
    topic: '',
    durationMinutes: '',
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateTask<K extends keyof QuickTaskDraft>(key: K, value: QuickTaskDraft[K]): void {
    setTaskDraft((current) => ({ ...current, [key]: value }));
  }

  async function submitTask(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const parsed = buildQuickTaskInput(taskDraft);
    if (!parsed.ok) {
      setError(`Tarefa não registrada: ${parsed.error}`);
      return;
    }
    setBusy(true);
    try {
      await tasksApi.create(parsed.value, crypto.randomUUID());
      setTaskDraft((current) => ({ ...current, title: '', estimateMinutes: '' }));
      setMessage('Tarefa registrada com a data local da conta.');
      onCreated();
    } catch (cause: unknown) {
      setError(errorMessage(cause, 'Não foi possível registrar a tarefa.'));
    } finally {
      setBusy(false);
    }
  }

  async function submitStudy(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const parsed = buildQuickStudyInput(studyDraft, timezone, new Date());
    if (!parsed.ok) {
      setError(`Sessão não registrada: ${parsed.error}`);
      return;
    }
    setBusy(true);
    try {
      await studiesApi.createSession(parsed.value, crypto.randomUUID());
      setStudyDraft({ topic: '', durationMinutes: '' });
      setMessage('Sessão de estudo registrada no fuso da conta.');
      onCreated();
    } catch (cause: unknown) {
      setError(errorMessage(cause, 'Não foi possível registrar a sessão de estudo.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div aria-live="polite">
        {message !== null && (
          <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            {message}
          </p>
        )}
        {error !== null && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
      </div>

      <form
        aria-label="Registrar tarefa rápida"
        onSubmit={(event) => void submitTask(event)}
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2"
      >
        <label className="block text-sm sm:col-span-2">
          <span className="text-muted-foreground">Título da tarefa</span>
          <input
            required
            maxLength={180}
            value={taskDraft.title}
            onChange={(event) => updateTask('title', event.target.value)}
            className={FIELD_CLASS}
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Prioridade declarada</span>
          <select
            value={taskDraft.priority}
            onChange={(event) => updateTask('priority', event.target.value as PlanPriority)}
            className={FIELD_CLASS}
          >
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {priorityLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Prazo local</span>
          <input
            type="date"
            value={taskDraft.dueDate}
            onChange={(event) => updateTask('dueDate', event.target.value)}
            className={FIELD_CLASS}
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Projeto (opcional)</span>
          <select
            value={taskDraft.projectId}
            onChange={(event) => updateTask('projectId', event.target.value)}
            className={FIELD_CLASS}
          >
            <option value="">Sem projeto</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Objetivo (opcional)</span>
          <select
            value={taskDraft.goalId}
            onChange={(event) => updateTask('goalId', event.target.value)}
            className={FIELD_CLASS}
          >
            <option value="">Sem objetivo</option>
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-muted-foreground">Estimativa em minutos (opcional)</span>
          <input
            type="number"
            min={0}
            max={100000}
            inputMode="numeric"
            value={taskDraft.estimateMinutes}
            onChange={(event) => updateTask('estimateMinutes', event.target.value)}
            className={FIELD_CLASS}
          />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy} className="min-h-11">
            <Icon name="arrow" size={16} />
            Registrar tarefa
          </Button>
        </div>
      </form>

      <form
        aria-label="Registrar sessão de estudo"
        onSubmit={(event) => void submitStudy(event)}
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2"
      >
        <label className="block text-sm sm:col-span-2">
          <span className="text-muted-foreground">Tópico estudado</span>
          <input
            required
            maxLength={192}
            value={studyDraft.topic}
            onChange={(event) =>
              setStudyDraft((current) => ({ ...current, topic: event.target.value }))
            }
            className={FIELD_CLASS}
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Duração em minutos</span>
          <input
            required
            type="number"
            min={1}
            max={1440}
            inputMode="numeric"
            value={studyDraft.durationMinutes}
            onChange={(event) =>
              setStudyDraft((current) => ({ ...current, durationMinutes: event.target.value }))
            }
            className={FIELD_CLASS}
          />
        </label>
        <div className="flex items-end">
          <Button type="submit" disabled={busy} className="min-h-11">
            <Icon name="arrow" size={16} />
            Registrar estudo
          </Button>
        </div>
      </form>

      <div>
        <p className="text-xs text-muted-foreground">
          Outros registros exigem campos específicos e devem ser feitos no módulo responsável.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link className={LINK_CLASS} to="/tempo">
            Registrar tempo
          </Link>
          <Link className={LINK_CLASS} to="/saude">
            Registrar saúde
          </Link>
          <Link className={LINK_CLASS} to="/treinamento">
            Registrar treinamento
          </Link>
          <Link className={LINK_CLASS} to="/importacoes">
            Importar dados
          </Link>
        </div>
      </div>
    </div>
  );
}
