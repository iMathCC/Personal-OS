/** Relógio injetável: testes nunca dependem do fuso ou da hora do servidor. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export function nowMs(clock: Clock): number {
  return clock.now().getTime();
}

export function toIso(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

export function addMs(clock: Clock, milliseconds: number): string {
  return toIso(nowMs(clock) + milliseconds);
}
