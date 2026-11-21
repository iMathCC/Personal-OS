export type CounterClassification = 'zero' | 'advance' | 'anomaly';

/**
 * Classifica o contador sem enfraquecer as demais verificações WebAuthn.
 * `0` só é aceito quando o último contável confiável também é `0`; qualquer
 * repetição ou regressão é anomalia e preserva o último valor confiável.
 */
export function classifyCounter(
  storedCounter: number,
  observedCounter: number,
): CounterClassification {
  if (observedCounter === 0 && storedCounter === 0) {
    return 'zero';
  }
  if (observedCounter > storedCounter) {
    return 'advance';
  }
  return 'anomaly';
}

export function trustedCounter(storedCounter: number, observedCounter: number): number {
  return classifyCounter(storedCounter, observedCounter) === 'advance'
    ? observedCounter
    : storedCounter;
}

/**
 * Valor informado à biblioteca apenas para que ela não rejeite a anomalia de
 * contador. Assinatura, UP, UV, origin e RP ID continuam sendo verificados.
 */
export function counterForVerification(storedCounter: number, observedCounter: number): number {
  const classification = classifyCounter(storedCounter, observedCounter);
  if (classification === 'advance' || classification === 'zero') {
    return storedCounter;
  }
  return observedCounter === 0 ? 0 : observedCounter - 1;
}

/** Lê o contador de 4 bytes Big-Endian em `authData` (offset 33). */
export function counterFromAuthenticatorData(authenticatorData: Uint8Array): number | null {
  if (authenticatorData.length < 37) {
    return null;
  }
  const view = new DataView(authenticatorData.buffer, authenticatorData.byteOffset + 33, 4);
  return view.getUint32(0, false);
}
