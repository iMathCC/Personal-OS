export const RECOVERY_CODE_BYTES = 16;
export const RECOVERY_TOKEN_BYTES = 32;
export const SESSION_TOKEN_BYTES = 32;
export const CSRF_TOKEN_BYTES = 16;

const HEX = /^[0-9a-f]+$/;

export function bytesToHex(bytes: Uint8Array): string {
  let output = '';
  for (const byte of bytes) {
    output += byte.toString(16).padStart(2, '0');
  }
  return output;
}

export function hexToBytes(value: string): Uint8Array | null {
  if (value.length % 2 !== 0 || !HEX.test(value)) {
    return null;
  }

  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
    if (!Number.isInteger(byte)) {
      return null;
    }
    bytes[index] = byte;
  }
  return bytes;
}

/**
 * Código legível com 128 bits de entropia, agrupado para reduzir erros de
 * digitação. O formato nunca carrega dados do usuário.
 */
export function formatRecoveryCode(bytes: Uint8Array): string {
  if (bytes.length !== RECOVERY_CODE_BYTES) {
    throw new Error('Código de recuperação exige 16 bytes.');
  }

  const hex = bytesToHex(bytes);
  return [hex.slice(0, 8), hex.slice(8, 16), hex.slice(16, 24), hex.slice(24, 32)].join('-');
}

/** Remove separadores e valida o formato canônico antes do hash. */
export function normalizeRecoveryCode(input: string): string | null {
  const compact = input.trim().toLowerCase().replace(/[\s-]/g, '');
  if (compact.length !== RECOVERY_CODE_BYTES * 2 || !HEX.test(compact)) {
    return null;
  }

  const bytes = hexToBytes(compact);
  return bytes === null ? null : formatRecoveryCode(bytes);
}

export function isRecoveryCode(input: string): boolean {
  return normalizeRecoveryCode(input) !== null;
}
