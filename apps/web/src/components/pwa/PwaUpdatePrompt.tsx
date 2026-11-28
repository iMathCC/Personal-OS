import { useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { PwaPromptView } from './PwaPromptView';

interface InstallPromptEvent extends Event {
  readonly prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Registro explícito: nenhuma atualização de service worker acontece sem confirmação. */
export function PwaUpdatePrompt() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  const updateRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    updateRef.current = registerSW({
      immediate: true,
      onNeedRefresh: () => {
        setUpdateDismissed(false);
        setUpdateAvailable(true);
      },
    });
    const onInstallPrompt = (event: Event): void => {
      event.preventDefault();
      setInstallDismissed(false);
      setInstallEvent(event as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onInstallPrompt);
  }, []);

  async function applyUpdate(): Promise<void> {
    setUpdateAvailable(false);
    await updateRef.current?.(true);
  }

  async function install(): Promise<void> {
    const event = installEvent;
    setInstallEvent(null);
    if (event === null) return;
    await event.prompt();
    await event.userChoice;
  }

  return (
    <PwaPromptView
      updateAvailable={updateAvailable}
      canInstall={installEvent !== null}
      updateDismissed={updateDismissed}
      installDismissed={installDismissed}
      onInstall={() => void install()}
      onUpdate={() => void applyUpdate()}
      onDismissUpdate={() => setUpdateDismissed(true)}
      onDismissInstall={() => setInstallDismissed(true)}
    />
  );
}
