import { unauthenticated, conflict } from './errors';

export type AuthPurpose = 'setup' | 'login' | 'recovery_register_passkey';

export interface UserSetupState {
  setupCompletedAt: string | null;
}

export interface RecoveryTokenState {
  consumedAt: string | null;
  expiresAt: string;
}

export interface ChallengeState {
  purpose: AuthPurpose | null;
  consumedAt: string | null;
  expiresAt: string;
}

export function canRunSetup(user: UserSetupState | null): boolean {
  return user === null || user.setupCompletedAt === null;
}

export function assertSetupAvailable(user: UserSetupState | null): void {
  if (!canRunSetup(user)) {
    throw conflict('O setup já foi concluído.');
  }
}

export function assertChallengeUsable(
  challenge: ChallengeState | null,
  expectedPurpose: AuthPurpose,
  now: number,
): void {
  if (
    challenge === null ||
    challenge.consumedAt !== null ||
    challenge.purpose !== expectedPurpose ||
    Date.parse(challenge.expiresAt) <= now
  ) {
    throw unauthenticated('Desafio inválido ou expirado.');
  }
}

export function assertRecoveryTokenUsable(token: RecoveryTokenState | null, now: number): void {
  if (token === null || token.consumedAt !== null || Date.parse(token.expiresAt) <= now) {
    throw unauthenticated('Token de recuperação inválido ou expirado.');
  }
}
