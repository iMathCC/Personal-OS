import { Button } from '@/components/ui/button';

export interface PwaPromptViewProps {
  readonly updateAvailable: boolean;
  readonly canInstall: boolean;
  readonly updateDismissed: boolean;
  readonly installDismissed: boolean;
  readonly onInstall: () => void;
  readonly onUpdate: () => void;
  readonly onDismissUpdate: () => void;
  readonly onDismissInstall: () => void;
}

export function PwaPromptView({
  updateAvailable,
  canInstall,
  updateDismissed,
  installDismissed,
  onInstall,
  onUpdate,
  onDismissUpdate,
  onDismissInstall,
}: PwaPromptViewProps) {
  const showUpdate = updateAvailable && !updateDismissed;
  const showInstall = canInstall && !installDismissed;
  if (!showUpdate && !showInstall) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4">
      {showUpdate && (
        <div
          role="status"
          className="pointer-events-auto flex w-full max-w-lg flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 bg-card p-4 text-sm shadow-lg"
        >
          <span>Uma nova versão está pronta. Atualize quando terminar o que está fazendo.</span>
          <div className="flex gap-2">
            <Button type="button" size="sm" className="min-h-11" onClick={onDismissUpdate}>
              Agora não
            </Button>
            <Button type="button" size="sm" className="min-h-11" onClick={onUpdate}>
              Atualizar
            </Button>
          </div>
        </div>
      )}
      {showInstall && (
        <div
          role="status"
          className="pointer-events-auto flex w-full max-w-lg flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-sm shadow-lg"
        >
          <span>Instale o Personal OS para abrir em modo standalone.</span>
          <div className="flex gap-2">
            <Button type="button" size="sm" className="min-h-11" onClick={onDismissInstall}>
              Agora não
            </Button>
            <Button type="button" size="sm" className="min-h-11" onClick={onInstall}>
              Instalar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
