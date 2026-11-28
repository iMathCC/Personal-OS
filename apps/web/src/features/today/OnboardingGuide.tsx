import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icons';

interface OnboardingGuideProps {
  readonly hasGoals: boolean;
  readonly hasProjects: boolean;
  readonly hasTasks: boolean;
  readonly hasActivity: boolean;
}

interface Step {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly href: string;
  readonly action: string;
  readonly done: boolean;
}

const DISMISS_KEY = 'personal-os:onboarding:dismissed:v1';

function loadDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function saveDismissed(value: boolean): void {
  try {
    if (value) localStorage.setItem(DISMISS_KEY, '1');
    else localStorage.removeItem(DISMISS_KEY);
  } catch {
    // armazenamento local indisponível: guia continua visível nesta sessão
  }
}

export function OnboardingGuide({
  hasGoals,
  hasProjects,
  hasTasks,
  hasActivity,
}: OnboardingGuideProps) {
  const [dismissed, setDismissed] = useState(loadDismissed);

  const steps = useMemo<Step[]>(
    () => [
      {
        id: 'goal',
        title: 'Defina um objetivo',
        description: 'Dá direção ao que você registra e ajuda a priorizar o que importa.',
        href: '/objetivos',
        action: 'Criar objetivo',
        done: hasGoals,
      },
      {
        id: 'project',
        title: 'Organize uma iniciativa',
        description: 'Projetos agrupam tarefas e conectam esforço a um resultado concreto.',
        href: '/projetos',
        action: 'Criar projeto',
        done: hasProjects,
      },
      {
        id: 'task',
        title: 'Crie uma primeira tarefa',
        description: 'Tarefas tornam o próximo passo visível e executável no dia a dia.',
        href: '/tarefas',
        action: 'Criar tarefa',
        done: hasTasks,
      },
      {
        id: 'activity',
        title: 'Registre uma atividade',
        description:
          'Registrar execução ou estudo ajuda a revisão diária a refletir o que aconteceu.',
        href: '/estudos',
        action: 'Registrar atividade',
        done: hasActivity,
      },
    ],
    [hasGoals, hasProjects, hasTasks, hasActivity],
  );

  const completed = steps.filter((s) => s.done).length;
  const allDone = completed === steps.length;

  if (allDone) return null;
  if (dismissed) {
    return (
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => {
            saveDismissed(false);
            setDismissed(false);
          }}
        >
          Mostrar primeiros passos
        </Button>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="onboarding-title"
      className="rounded-xl border border-primary/20 bg-primary/5 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-primary uppercase">
            Primeiros passos
          </p>
          <h3 id="onboarding-title" className="mt-1 text-base font-semibold">
            Comece pelo essencial
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Um guia rápido para dar contexto ao seu dia. Você pode dispensar e retomar quando
            quiser.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          onClick={() => {
            saveDismissed(true);
            setDismissed(true);
          }}
        >
          Dispensar
        </Button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {completed} de {steps.length} passos concluídos
      </p>
      <ol className="mt-3 space-y-2">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={`rounded-lg border p-3 ${step.done ? 'border-primary/20 bg-background/60' : 'border-border bg-card'}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">
                  <span className="mr-2 text-muted-foreground">{index + 1}.</span>
                  {step.title}
                  {step.done && <span className="ml-2 text-xs text-primary">Concluído</span>}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
              </div>
              {!step.done && (
                <Link
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                  to={step.href}
                >
                  {step.action}
                  <Icon name="arrow" size={15} />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function OnboardingGuideResume({ onResume }: { readonly onResume: () => void }) {
  return (
    <Button type="button" variant="outline" className="min-h-11" onClick={onResume}>
      Mostrar primeiros passos
    </Button>
  );
}
