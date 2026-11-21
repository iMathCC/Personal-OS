import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icons';
import { ApiError, authApi } from '@/lib/api';

type Stage = 'login' | 'setup' | 'recovery' | 'recovery-register' | 'recovery-codes';

interface AuthScreenProps {
  onAuthenticated: () => Promise<void>;
}

const INPUT_CLASS =
  'mt-1.5 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring';
const LABEL_CLASS = 'block text-sm font-medium text-foreground';

function message(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error && error.name === 'NotAllowedError') {
    return 'Operação cancelada ou não permitida pelo autenticador.';
  }
  return 'Não foi possível concluir a operação. Tente novamente.';
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [stage, setStage] = useState<Stage>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [setupToken, setSetupToken] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
  );
  const [passkeyName, setPasskeyName] = useState('Passkey principal');

  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryToken, setRecoveryToken] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [codesConfirmed, setCodesConfirmed] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  function handleSetup(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const options = await authApi.setupOptions(setupToken);
      const credential = await startRegistration({ optionsJSON: options.options });
      const result = await authApi.setupVerify({
        setupToken,
        challengeId: options.challengeId,
        credential,
        displayName,
        timezone,
        passkeyName,
      });
      setCodes(result.recoveryCodes);
      setCodesConfirmed(false);
      setStage('recovery-codes');
    });
  }

  function handleLogin(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const options = await authApi.loginOptions();
      const credential = await startAuthentication({ optionsJSON: options.options });
      await authApi.loginVerify({ challengeId: options.challengeId, credential });
      await onAuthenticated();
    });
  }

  function handleRecovery(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const result = await authApi.recoveryVerify(recoveryCode);
      setRecoveryToken(result.recoveryToken);
      setStage('recovery-register');
      setNotice('Sessões encerradas. Cadastre uma nova passkey para continuar.');
    });
  }

  function handleRecoveryRegister(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const options = await authApi.recoveryRegisterOptions(recoveryToken);
      const credential = await startRegistration({ optionsJSON: options.options });
      await authApi.recoveryRegisterVerify({
        recoveryToken,
        challengeId: options.challengeId,
        credential,
        passkeyName,
      });
      setRecoveryToken('');
      setRecoveryCode('');
      setStage('login');
      setNotice('Passkey cadastrada. Entre normalmente.');
    });
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-lg">
        <header className="mb-8 flex items-center gap-3">
          <div
            aria-hidden="true"
            className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/25"
          >
            <Icon name="shield" size={22} />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight text-foreground">Personal OS</p>
            <p className="text-xs text-muted-foreground">Acesso por passkey</p>
          </div>
        </header>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-none sm:p-8">
          {error !== null && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {notice !== null && (
            <p
              role="status"
              className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-primary"
            >
              {notice}
            </p>
          )}

          {stage === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Bem-vindo de volta
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">Entre usando sua passkey.</p>
              </div>
              <Button type="submit" className="min-h-11 w-full" disabled={busy}>
                {busy ? 'Aguarde…' : 'Entrar com passkey'}
              </Button>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => setStage('setup')}
                >
                  Primeiro acesso
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => setStage('recovery')}
                >
                  Recuperar acesso
                </Button>
              </div>
            </form>
          )}

          {stage === 'setup' && (
            <form onSubmit={handleSetup} className="space-y-4">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Criar conta</h1>
              <p className="text-sm text-muted-foreground">Somente uma conta pode ser criada.</p>
              <div>
                <label className={LABEL_CLASS} htmlFor="setup-token">
                  Token de setup
                </label>
                <input
                  id="setup-token"
                  className={INPUT_CLASS}
                  value={setupToken}
                  onChange={(e) => setSetupToken(e.target.value)}
                  required
                  autoComplete="off"
                />
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="display-name">
                  Nome de exibição
                </label>
                <input
                  id="display-name"
                  className={INPUT_CLASS}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  maxLength={100}
                />
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="timezone">
                  Fuso horário
                </label>
                <input
                  id="timezone"
                  className={INPUT_CLASS}
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="passkey-name">
                  Nome da passkey
                </label>
                <input
                  id="passkey-name"
                  className={INPUT_CLASS}
                  value={passkeyName}
                  onChange={(e) => setPasskeyName(e.target.value)}
                  required
                  maxLength={60}
                />
              </div>
              <Button type="submit" className="min-h-11 w-full" disabled={busy}>
                {busy ? 'Criando…' : 'Criar passkey'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 w-full"
                onClick={() => setStage('login')}
              >
                Voltar
              </Button>
            </form>
          )}

          {stage === 'recovery' && (
            <form onSubmit={handleRecovery} className="space-y-5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Recuperar acesso
              </h1>
              <p className="text-sm text-muted-foreground">
                Use um código de recuperação nunca usado. Todas as sessões serão encerradas.
              </p>
              <div>
                <label className={LABEL_CLASS} htmlFor="recovery-code">
                  Código de recuperação
                </label>
                <input
                  id="recovery-code"
                  className={`${INPUT_CLASS} font-mono`}
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  required
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <Button type="submit" className="min-h-11 w-full" disabled={busy}>
                {busy ? 'Validando…' : 'Validar código'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 w-full"
                onClick={() => setStage('login')}
              >
                Voltar
              </Button>
            </form>
          )}

          {stage === 'recovery-register' && (
            <form onSubmit={handleRecoveryRegister} className="space-y-5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Nova passkey
              </h1>
              <p className="text-sm text-muted-foreground">
                O token de recuperação expira em 10 minutos.
              </p>
              <div>
                <label className={LABEL_CLASS} htmlFor="recovery-passkey-name">
                  Nome da nova passkey
                </label>
                <input
                  id="recovery-passkey-name"
                  className={INPUT_CLASS}
                  value={passkeyName}
                  onChange={(e) => setPasskeyName(e.target.value)}
                  required
                  maxLength={60}
                />
              </div>
              <Button type="submit" className="min-h-11 w-full" disabled={busy}>
                {busy ? 'Cadastrando…' : 'Cadastrar passkey'}
              </Button>
            </form>
          )}

          {stage === 'recovery-codes' && (
            <div className="space-y-5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Guarde seus códigos
              </h1>
              <p className="text-sm text-muted-foreground">
                Esta é a única vez em que eles serão exibidos.
              </p>
              <ol className="grid gap-1 rounded-lg bg-muted p-4 font-mono text-sm text-primary sm:grid-cols-2">
                {codes.map((code) => (
                  <li key={code} className="py-1">
                    {code}
                  </li>
                ))}
              </ol>
              <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="size-5 accent-primary"
                  checked={codesConfirmed}
                  onChange={(e) => setCodesConfirmed(e.target.checked)}
                />
                Guardei os 10 códigos em local seguro
              </label>
              <Button
                type="button"
                className="min-h-11 w-full"
                disabled={!codesConfirmed || busy}
                onClick={() =>
                  void run(async () => {
                    await onAuthenticated();
                  })
                }
              >
                Continuar
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
