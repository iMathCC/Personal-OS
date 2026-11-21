import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { WebAuthnCredential } from '@simplewebauthn/server';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  randomBytes,
  utf8Bytes,
  VirtualAuthenticator,
  type ResponseOverrides,
} from './virtual-authenticator';

const RP_ID = 'personal-os.test';
const ORIGIN = 'https://personal-os.test';
const SUPPORTED_ALGORITHMS = [-7];

type RegistrationFixture = {
  authenticator: VirtualAuthenticator;
  challenge: string;
  response: Awaited<ReturnType<VirtualAuthenticator['createRegistrationResponse']>>;
};

type LatencySummary = {
  samples: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
};

async function createRegistrationFixture(
  overrides: ResponseOverrides = {},
  initialCounter = 0,
): Promise<RegistrationFixture> {
  const authenticator = await VirtualAuthenticator.create({
    rpId: RP_ID,
    origin: ORIGIN,
    initialCounter,
  });
  const options = await generateRegistrationOptions({
    rpName: 'Personal OS spike',
    rpID: RP_ID,
    userName: 'spike-user',
    userID: utf8Bytes('spike-user'),
    challenge: randomBytes(32),
    attestationType: 'none',
    supportedAlgorithmIDs: SUPPORTED_ALGORITHMS,
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required',
    },
  });
  const response = await authenticator.createRegistrationResponse(options, overrides);

  return { authenticator, challenge: options.challenge, response };
}

function verifyRegistration(fixture: RegistrationFixture) {
  return verifyRegistrationResponse({
    response: fixture.response,
    expectedChallenge: fixture.challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    requireUserPresence: true,
    requireUserVerification: true,
    supportedAlgorithmIDs: SUPPORTED_ALGORITHMS,
  });
}

async function registerSuccessfully(initialCounter = 0) {
  const fixture = await createRegistrationFixture({}, initialCounter);
  const result = await verifyRegistration(fixture);

  expect(result.verified).toBe(true);
  if (!result.verified) {
    throw new Error('O registro deveria ter sido verificado');
  }

  return { fixture, result };
}

async function createAuthenticationOptions(credentialId: string) {
  return generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: [{ id: credentialId, transports: ['internal'] }],
    challenge: randomBytes(32),
    userVerification: 'required',
  });
}

function verifyAuthentication(
  response: Awaited<ReturnType<VirtualAuthenticator['createAuthenticationResponse']>>,
  challenge: string,
  credential: WebAuthnCredential,
) {
  return verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    credential,
    requireUserVerification: true,
  });
}

function summarize(samples: number[]): LatencySummary {
  const sorted = [...samples].sort((left, right) => left - right);
  const valueAt = (index: number) => {
    const value = sorted[index];
    if (value === undefined) {
      throw new Error('Não é possível resumir uma amostra vazia');
    }
    return value;
  };
  const percentile = (fraction: number) => {
    const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
    return Number(valueAt(index).toFixed(3));
  };
  const mean = samples.reduce((total, sample) => total + sample, 0) / samples.length;

  return {
    samples: sorted.length,
    meanMs: Number(mean.toFixed(3)),
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: Number(valueAt(sorted.length - 1).toFixed(3)),
  };
}

describe('spike WebAuthn no runtime Workers', () => {
  it('executa dentro do runtime Workers com WebCrypto e D1 disponíveis', async () => {
    const row = await env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();

    expect(row?.ok).toBe(1);
    expect(crypto.subtle).toBeDefined();
  });

  it('registra uma credencial real com UP, UV, origin e RP ID corretos', async () => {
    const { fixture, result } = await registerSuccessfully();
    const info = result.registrationInfo;

    expect(info.userVerified).toBe(true);
    expect(info.origin).toBe(ORIGIN);
    expect(info.rpID).toBe(RP_ID);
    expect(info.credential.counter).toBe(0);
    expect(info.credential.publicKey.length).toBeGreaterThan(0);
    expect(info.credential.id).toBe(fixture.response.id);
    expect(info.credential.id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejeita registro sem UP', async () => {
    const fixture = await createRegistrationFixture({ flags: { up: false, uv: true } });

    await expect(verifyRegistration(fixture)).rejects.toThrow(/user presence/i);
  });

  it('rejeita registro sem UV', async () => {
    const fixture = await createRegistrationFixture({ flags: { up: true, uv: false } });

    await expect(verifyRegistration(fixture)).rejects.toThrow(/user verification/i);
  });

  it('rejeita registro com origin incorreta', async () => {
    const fixture = await createRegistrationFixture({ origin: 'https://atacante.example' });

    await expect(verifyRegistration(fixture)).rejects.toThrow(/origin/i);
  });

  it('rejeita registro com RP ID incorreto', async () => {
    const fixture = await createRegistrationFixture({ rpId: 'outro.test' });

    await expect(verifyRegistration(fixture)).rejects.toThrow(/rp id/i);
  });

  it('verifica uma asserção real com assinatura, UP, UV, origin e RP ID corretos', async () => {
    const { fixture, result } = await registerSuccessfully();
    const credential = result.registrationInfo.credential;
    const options = await createAuthenticationOptions(credential.id);
    const assertion = await fixture.authenticator.createAuthenticationResponse(options, {
      counter: 5,
    });
    const verification = await verifyAuthentication(assertion, options.challenge, credential);

    expect(verification.verified).toBe(true);
    expect(verification.authenticationInfo.newCounter).toBe(5);
    expect(verification.authenticationInfo.userVerified).toBe(true);
    expect(verification.authenticationInfo.origin).toBe(ORIGIN);
    expect(verification.authenticationInfo.rpID).toBe(RP_ID);
  });

  it('rejeita asserção sem UV', async () => {
    const { fixture, result } = await registerSuccessfully();
    const credential = result.registrationInfo.credential;
    const options = await createAuthenticationOptions(credential.id);
    const assertion = await fixture.authenticator.createAuthenticationResponse(options, {
      counter: 1,
      flags: { up: true, uv: false },
    });

    await expect(verifyAuthentication(assertion, options.challenge, credential)).rejects.toThrow(
      /user verification/i,
    );
  });

  it('rejeita asserção com origin incorreta', async () => {
    const { fixture, result } = await registerSuccessfully();
    const credential = result.registrationInfo.credential;
    const options = await createAuthenticationOptions(credential.id);
    const assertion = await fixture.authenticator.createAuthenticationResponse(options, {
      counter: 1,
      origin: 'https://atacante.example',
    });

    await expect(verifyAuthentication(assertion, options.challenge, credential)).rejects.toThrow(
      /origin/i,
    );
  });

  it('rejeita asserção com RP ID incorreto', async () => {
    const { fixture, result } = await registerSuccessfully();
    const credential = result.registrationInfo.credential;
    const options = await createAuthenticationOptions(credential.id);
    const assertion = await fixture.authenticator.createAuthenticationResponse(options, {
      counter: 1,
      rpId: 'outro.test',
    });

    await expect(verifyAuthentication(assertion, options.challenge, credential)).rejects.toThrow(
      /rp id/i,
    );
  });

  it('aceita contador zero quando o contador armazenado também é zero', async () => {
    const { fixture, result } = await registerSuccessfully();
    const credential = result.registrationInfo.credential;
    const options = await createAuthenticationOptions(credential.id);
    const assertion = await fixture.authenticator.createAuthenticationResponse(options, {
      counter: 0,
    });
    const verification = await verifyAuthentication(assertion, options.challenge, credential);

    expect(verification.verified).toBe(true);
    expect(verification.authenticationInfo.newCounter).toBe(0);
  });

  it('aceita contador crescente', async () => {
    const { fixture, result } = await registerSuccessfully();
    const credential = { ...result.registrationInfo.credential, counter: 3 };
    const options = await createAuthenticationOptions(credential.id);
    const assertion = await fixture.authenticator.createAuthenticationResponse(options, {
      counter: 4,
    });
    const verification = await verifyAuthentication(assertion, options.challenge, credential);

    expect(verification.verified).toBe(true);
    expect(verification.authenticationInfo.newCounter).toBe(4);
  });

  it('rejeita contador igual ao armazenado quando ele é maior que zero', async () => {
    const { fixture, result } = await registerSuccessfully();
    const credential = { ...result.registrationInfo.credential, counter: 4 };
    const options = await createAuthenticationOptions(credential.id);
    const assertion = await fixture.authenticator.createAuthenticationResponse(options, {
      counter: 4,
    });

    await expect(verifyAuthentication(assertion, options.challenge, credential)).rejects.toThrow(
      /counter value 4 was lower than expected 4/i,
    );
  });

  it('rejeita contador regressivo', async () => {
    const { fixture, result } = await registerSuccessfully();
    const credential = { ...result.registrationInfo.credential, counter: 8 };
    const options = await createAuthenticationOptions(credential.id);
    const assertion = await fixture.authenticator.createAuthenticationResponse(options, {
      counter: 3,
    });

    await expect(verifyAuthentication(assertion, options.challenge, credential)).rejects.toThrow(
      /counter value 3 was lower than expected 8/i,
    );
  });
}, 120_000);

describe('latência local do spike (não é CPU)', () => {
  it('mede verificação de registro e de asserção no runtime local', async () => {
    const registrationSamples: number[] = [];

    for (let index = 0; index < 30; index += 1) {
      const fixture = await createRegistrationFixture();
      const startedAt = performance.now();
      const result = await verifyRegistration(fixture);
      registrationSamples.push(performance.now() - startedAt);

      expect(result.verified).toBe(true);
    }

    const { fixture, result: registration } = await registerSuccessfully();
    const credential = registration.registrationInfo.credential;
    const authenticationSamples: number[] = [];
    let storedCounter = credential.counter;

    for (let index = 1; index <= 30; index += 1) {
      const options = await createAuthenticationOptions(credential.id);
      const assertion = await fixture.authenticator.createAuthenticationResponse(options, {
        counter: storedCounter + index,
      });
      const currentCredential = { ...credential, counter: storedCounter };
      const startedAt = performance.now();
      const result = await verifyAuthentication(assertion, options.challenge, currentCredential);
      authenticationSamples.push(performance.now() - startedAt);

      expect(result.verified).toBe(true);
      storedCounter = result.authenticationInfo.newCounter;
    }

    const summary = {
      registration: summarize(registrationSamples),
      authentication: summarize(authenticationSamples),
      observacao: 'Latência local medida no Miniflare; não representa CPU do Cloudflare Workers.',
    };

    console.log(`[spike:latencia] ${JSON.stringify(summary)}`);
    expect(registrationSamples.length).toBe(30);
    expect(authenticationSamples.length).toBe(30);
  }, 120_000);
});
