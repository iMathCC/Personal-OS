import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  WebAuthnCredential,
} from '@simplewebauthn/server';

type Bytes = Uint8Array<ArrayBuffer>;
type CborValue = number | string | Bytes | CborValue[] | Map<CborValue, CborValue>;

type FlagsOverride = {
  up?: boolean;
  uv?: boolean;
};

export type ResponseOverrides = {
  origin?: string;
  rpId?: string;
  flags?: FlagsOverride;
  counter?: number;
};

export type VirtualAuthenticatorOptions = {
  rpId: string;
  origin: string;
  initialCounter?: number;
  credentialId?: Uint8Array;
};

const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;
const FLAG_ATTESTED_CREDENTIAL_DATA = 0x40;

export function utf8Bytes(value: string): Bytes {
  return new Uint8Array(new TextEncoder().encode(value));
}

export function randomBytes(length: number): Bytes {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(value: string): Bytes {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function toBytes(value: Uint8Array): Bytes {
  const copy = new Uint8Array(value.length);
  copy.set(value);
  return copy;
}

function concatBytes(...arrays: Uint8Array[]): Bytes {
  const totalLength = arrays.reduce((total, array) => total + array.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }

  return result;
}

async function sha256(data: Uint8Array): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

function encodeCborHeader(majorType: number, value: number): Bytes {
  const prefix = majorType << 5;

  if (value < 24) {
    return new Uint8Array([prefix | value]);
  }

  if (value <= 0xff) {
    return new Uint8Array([prefix | 24, value]);
  }

  if (value <= 0xffff) {
    return new Uint8Array([prefix | 25, (value >> 8) & 0xff, value & 0xff]);
  }

  if (value <= 0xffffffff) {
    return new Uint8Array([
      prefix | 26,
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    ]);
  }

  throw new Error('CBOR values above 2^32 are not required by this spike');
}

function encodeCbor(value: CborValue): Bytes {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error('Only integer CBOR values are supported');
    }

    if (value >= 0) {
      return encodeCborHeader(0, value);
    }

    return encodeCborHeader(1, -1 - value);
  }

  if (typeof value === 'string') {
    const encoded = utf8Bytes(value);
    return concatBytes(encodeCborHeader(3, encoded.length), encoded);
  }

  if (value instanceof Uint8Array) {
    return concatBytes(encodeCborHeader(2, value.length), value);
  }

  if (Array.isArray(value)) {
    const chunks = [encodeCborHeader(4, value.length), ...value.map(encodeCbor)];
    return concatBytes(...chunks);
  }

  const chunks = [encodeCborHeader(5, value.size)];
  for (const [key, entry] of value.entries()) {
    chunks.push(encodeCbor(key), encodeCbor(entry));
  }

  return concatBytes(...chunks);
}

function encodeCounter(counter: number): Bytes {
  if (!Number.isInteger(counter) || counter < 0 || counter > 0xffffffff) {
    throw new Error('Counter must be an unsigned 32-bit integer');
  }

  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, counter, false);
  return bytes;
}

function flagsFrom(overrides: FlagsOverride | undefined, defaults: FlagsOverride): number {
  const up = overrides?.up ?? defaults.up ?? false;
  const uv = overrides?.uv ?? defaults.uv ?? false;
  return (up ? FLAG_USER_PRESENT : 0) | (uv ? FLAG_USER_VERIFIED : 0);
}

function stripLeadingZeros(bytes: Uint8Array): Bytes {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) {
    start += 1;
  }
  return toBytes(bytes.subarray(start));
}

function encodeDerInteger(value: Uint8Array): Bytes {
  const stripped = stripLeadingZeros(value);
  const first = stripped[0];

  if (first === undefined) {
    throw new Error('Inteiro DER vazio');
  }

  const content = (first & 0x80) !== 0 ? concatBytes(new Uint8Array([0]), stripped) : stripped;

  return concatBytes(new Uint8Array([0x02, content.length]), content);
}

function webCryptoSignatureToDer(signature: Uint8Array): Bytes {
  const half = signature.length / 2;
  const encodedR = encodeDerInteger(signature.subarray(0, half));
  const encodedS = encodeDerInteger(signature.subarray(half));
  const content = concatBytes(encodedR, encodedS);

  if (content.length > 0x7f) {
    throw new Error('Não foi necessário codificar sequências DER longas neste spike');
  }

  return concatBytes(new Uint8Array([0x30, content.length]), content);
}

function clientDataJson(
  type: 'webauthn.create' | 'webauthn.get',
  challenge: string,
  origin: string,
): Bytes {
  return utf8Bytes(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
}

function isCryptoKeyPair(value: CryptoKey | CryptoKeyPair): value is CryptoKeyPair {
  return 'publicKey' in value && 'privateKey' in value;
}

function isJwkWithCoordinates(
  value: ArrayBuffer | JsonWebKey,
): value is JsonWebKey & { x: string; y: string } {
  return 'x' in value && typeof value.x === 'string' && 'y' in value && typeof value.y === 'string';
}

export class VirtualAuthenticator {
  readonly #credentialId: Bytes;
  readonly #privateKey: CryptoKey;
  readonly #cosePublicKey: Bytes;
  readonly #rpId: string;
  readonly #origin: string;
  #counter: number;

  private constructor(
    credentialId: Bytes,
    privateKey: CryptoKey,
    cosePublicKey: Bytes,
    rpId: string,
    origin: string,
    initialCounter: number,
  ) {
    this.#credentialId = credentialId;
    this.#privateKey = privateKey;
    this.#cosePublicKey = cosePublicKey;
    this.#rpId = rpId;
    this.#origin = origin;
    this.#counter = initialCounter;
  }

  static async create(options: VirtualAuthenticatorOptions): Promise<VirtualAuthenticator> {
    const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ]);

    if (!isCryptoKeyPair(keyPair)) {
      throw new Error('A geração de chave não retornou um par assimétrico');
    }

    const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

    if (!isJwkWithCoordinates(jwk)) {
      throw new Error('A chave pública gerada não continha coordenadas x/y');
    }

    const coseKey: Map<CborValue, CborValue> = new Map();
    coseKey.set(1, 2);
    coseKey.set(3, -7);
    coseKey.set(-1, 1);
    coseKey.set(-2, base64UrlToBytes(jwk.x));
    coseKey.set(-3, base64UrlToBytes(jwk.y));

    return new VirtualAuthenticator(
      toBytes(options.credentialId ?? randomBytes(32)),
      keyPair.privateKey,
      encodeCbor(coseKey),
      options.rpId,
      options.origin,
      options.initialCounter ?? 0,
    );
  }

  get credentialId(): Bytes {
    return this.#credentialId;
  }

  get counter(): number {
    return this.#counter;
  }

  getStoredCredential(counter = this.#counter): WebAuthnCredential {
    return {
      id: bytesToBase64Url(this.#credentialId),
      publicKey: this.#cosePublicKey,
      counter,
    };
  }

  async createRegistrationResponse(
    options: PublicKeyCredentialCreationOptionsJSON,
    overrides: ResponseOverrides = {},
  ): Promise<RegistrationResponseJSON> {
    const rpId = overrides.rpId ?? options.rp.id ?? this.#rpId;
    const origin = overrides.origin ?? this.#origin;
    const clientData = clientDataJson('webauthn.create', options.challenge, origin);
    const flags =
      flagsFrom(overrides.flags, { up: true, uv: true }) | FLAG_ATTESTED_CREDENTIAL_DATA;
    const aaguid = new Uint8Array(16);
    const credentialIdLength = new Uint8Array(2);
    new DataView(credentialIdLength.buffer).setUint16(0, this.#credentialId.length, false);

    const authenticatorData = concatBytes(
      await sha256(utf8Bytes(rpId)),
      new Uint8Array([flags]),
      encodeCounter(this.#counter),
      aaguid,
      credentialIdLength,
      this.#credentialId,
      this.#cosePublicKey,
    );

    const attestationMap: Map<CborValue, CborValue> = new Map();
    attestationMap.set('fmt', 'none');
    attestationMap.set('attStmt', new Map<CborValue, CborValue>());
    attestationMap.set('authData', authenticatorData);

    return {
      id: bytesToBase64Url(this.#credentialId),
      rawId: bytesToBase64Url(this.#credentialId),
      response: {
        clientDataJSON: bytesToBase64Url(clientData),
        attestationObject: bytesToBase64Url(encodeCbor(attestationMap)),
        transports: ['internal'],
      },
      clientExtensionResults: {},
      type: 'public-key',
    };
  }

  async createAuthenticationResponse(
    options: PublicKeyCredentialRequestOptionsJSON,
    overrides: ResponseOverrides = {},
  ): Promise<AuthenticationResponseJSON> {
    const rpId = overrides.rpId ?? options.rpId ?? this.#rpId;
    const origin = overrides.origin ?? this.#origin;
    const counter = overrides.counter ?? this.#counter;
    const clientData = clientDataJson('webauthn.get', options.challenge, origin);
    const flags = flagsFrom(overrides.flags, { up: true, uv: true });
    const authenticatorData = concatBytes(
      await sha256(utf8Bytes(rpId)),
      new Uint8Array([flags]),
      encodeCounter(counter),
    );
    const signatureBase = concatBytes(authenticatorData, await sha256(clientData));
    const signature = webCryptoSignatureToDer(
      new Uint8Array(
        await crypto.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          this.#privateKey,
          signatureBase,
        ),
      ),
    );

    return {
      id: bytesToBase64Url(this.#credentialId),
      rawId: bytesToBase64Url(this.#credentialId),
      response: {
        clientDataJSON: bytesToBase64Url(clientData),
        authenticatorData: bytesToBase64Url(authenticatorData),
        signature: bytesToBase64Url(signature),
      },
      clientExtensionResults: {},
      type: 'public-key',
    };
  }
}
