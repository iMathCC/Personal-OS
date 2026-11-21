import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type { SessionDto, UserDto } from '@personal-os/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { ApiError, authApi, clearPrivateCaches } from '@/lib/api';

type Stage =
  | 'loading'
  | 'login'
  | 'setup'
  | 'recovery'
  | 'recovery-register'
  | 'recovery-codes'
  | 'authenticated';

interface Account {
  user: UserDto;
  counts: { passkeys: number; activeSessions: number };
}

const INPUT_CLASS =
  'mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-teal-600';
const LABEL_CLASS = 'block text-sm font-medium text-slate-700';

function message(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error && error.name === 'NotAllowedError') {
    return 'Operação cancelada ou não permitida pelo autenticador.';
  }
  return 'Não foi possível concluir a operação. Tente novamente.';
}

export function AuthScreen() {
  const [stage, setStage] = useState<Stage>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [setupToken, setSetupToken] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [passkeyName, setPasskeyName] = useState('Passkey principal');

  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryToken, setRecoveryToken] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [codesConfirmed, setCodesConfirmed] = useState(false);

  const [account, setAccount] = useState<Account | null>(null);
  const [sessions, setSessions] = useState<SessionDto[]>([]);

  async function loadAccount(): Promise<boolean> {
    try {
      const [me, list] = await Promise.all([authApi.me(), authApi.sessions()]);
      setAccount(me);
      setSessions(list);
      setStage('authenticated');
      return true;
    } catch {
      return false;
    }
  }

  // A sessão é armazenada fora do React (cookie HttpOnly) e só pode ser
  // descoberta por uma chamada à API. O estado é atualizado no callback da
  // resposta — nunca de forma síncrona durante a renderização ou o efeito.
  /* eslint-disable react-hooks/set-state-in-effect -- bootstrap assíncrono de auth */
  useEffect(() => {
    void loadAccount().then((ok) => {
      if (!ok) {
        setStage('login');
      }
    });
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

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
      await loadAccount();
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

  function handleLogout(all: boolean) {
    void run(async () => {
      if (all) {
        await authApi.logoutAll();
      } else {
        await authApi.logout();
      }
      await clearPrivateCaches();
      setAccount(null);
      setSessions([]);
      setStage('login');
      setNotice('Sessão encerrada.');
    });
  }

  function handleRevoke(id: string) {
    void run(async () => {
      await authApi.revokeSession(id);
      setSessions((current) => current.filter((session) => session.id !== id));
      setNotice('Sessão revogada.');
    });
  }

  if (stage === 'loading') {
    return <main className="mx-auto max-w-md px-5 py-16 text-slate-600">Verificando sessão…</main>;
  }

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top_left,_#ccfbf1_0,_transparent_38%),radial-gradient(circle_at_bottom_right,_#e2e8f0_0,_transparent_42%)]">
      <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 py-8 sm:px-8">
        <header className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="grid size-11 place-items-center rounded-xl bg-slate-900 text-lg font-bold text-teal-300"
          >
            P
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Personal OS</p>
            <p className="text-xs text-muted-foreground">Acesso por passkey</p>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center py-10">
          <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-xl sm:p-8">
            {error !== null && (
              <p
                role="alert"
                className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              >
                {error}
              </p>
            )}
            {notice !== null && (
              <p
                role="status"
                className="mb-4 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800"
              >
                {notice}
              </p>
            )}

            {stage === 'login' && (
              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <h1 className="text-2xl font-semibold text-slate-950">Bem-vindo de volta</h1>
                  <p className="mt-2 text-sm text-slate-600">Entre usando sua passkey.</p>
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
                <h1 className="text-2xl font-semibold text-slate-950">Criar conta</h1>
                <p className="text-sm text-slate-600">Somente uma conta pode ser criada.</p>
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
                <h1 className="text-2xl font-semibold text-slate-950">Recuperar acesso</h1>
                <p className="text-sm text-slate-600">
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
                <h1 className="text-2xl font-semibold text-slate-950">Nova passkey</h1>
                <p className="text-sm text-slate-600">
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
                <h1 className="text-2xl font-semibold text-slate-950">Guarde seus códigos</h1>
                <p className="text-sm text-slate-600">
                  Esta é a única vez em que eles serão exibidos.
                </p>
                <ol className="grid gap-1 rounded-lg bg-slate-900 p-4 font-mono text-sm text-teal-200 sm:grid-cols-2">
                  {codes.map((code) => (
                    <li key={code} className="py-1">
                      {code}
                    </li>
                  ))}
                </ol>
                <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="size-5 accent-teal-700"
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
                    void loadAccount().then((ok) => {
                      if (!ok) setStage('login');
                    })
                  }
                >
                  Continuar
                </Button>
              </div>
            )}

            {stage === 'authenticated' && account !== null && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-semibold text-slate-950">
                    Olá, {account.user.displayName}
                  </h1>
                  <p className="mt-1 text-sm text-slate-600">
                    {account.counts.passkeys} passkey(s) · {account.counts.activeSessions}{' '}
                    sessão(ões) ativa(s)
                  </p>
                </div>

                <div>
                  <h2 className="text-sm font-semibold text-slate-800">Sessões</h2>
                  <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200">
                    {sessions.map((session) => (
                      <li
                        key={session.id}
                        className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="text-sm">
                          <p className="font-medium text-slate-800">
                            {session.userAgent}
                            {session.current ? ' · atual' : ''}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Intl.DateTimeFormat('pt-BR', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            }).format(new Date(session.lastSeenAt))}
                          </p>
                        </div>
                        {!session.current && (
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11"
                            disabled={busy}
                            onClick={() => handleRevoke(session.id)}
                          >
                            Revogar
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => handleLogout(false)}
                  >
                    Sair
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => handleLogout(true)}
                  >
                    Sair de todos
                  </Button>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
