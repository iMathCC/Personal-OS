import { z } from 'zod';

const base64Url = z.string().regex(/^[A-Za-z0-9_-]+$/, 'Base64url inválido.');

export const challengeIdSchema = z.string().min(1).max(128);
export const recoveryTokenSchema = z.string().min(32).max(512);
export const recoveryCodeSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase().replace(/[\s-]/g, ''))
  .refine((value) => /^[0-9a-f]{32}$/.test(value), 'Código de recuperação inválido.');

export const registrationCredentialSchema = z
  .object({
    id: base64Url,
    rawId: base64Url,
    response: z.object({
      clientDataJSON: base64Url,
      attestationObject: base64Url,
      authenticatorData: base64Url.optional(),
      transports: z.array(z.string()).optional(),
      publicKeyAlgorithm: z.number().int().optional(),
      publicKey: base64Url.optional(),
    }),
    authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
    clientExtensionResults: z.record(z.string(), z.unknown()),
    type: z.literal('public-key'),
  })
  .strict();

export const authenticationCredentialSchema = z
  .object({
    id: base64Url,
    rawId: base64Url,
    response: z.object({
      clientDataJSON: base64Url,
      authenticatorData: base64Url,
      signature: base64Url,
      userHandle: base64Url.optional(),
    }),
    authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
    clientExtensionResults: z.record(z.string(), z.unknown()),
    type: z.literal('public-key'),
  })
  .strict();

export type RegistrationCredential = z.infer<typeof registrationCredentialSchema>;
export type AuthenticationCredential = z.infer<typeof authenticationCredentialSchema>;

export const setupOptionsRequestSchema = z.object({}).strict();
export const setupVerifyRequestSchema = z
  .object({
    challengeId: challengeIdSchema,
    credential: registrationCredentialSchema,
    displayName: z.string().min(1).max(100),
    timezone: z.string().min(1).max(64),
    passkeyName: z.string().min(1).max(60).default('Passkey principal'),
  })
  .strict();

export const loginOptionsRequestSchema = z.object({}).strict();
export const loginVerifyRequestSchema = z
  .object({
    challengeId: challengeIdSchema,
    credential: authenticationCredentialSchema,
  })
  .strict();

export const recoveryVerifyRequestSchema = z
  .object({
    code: recoveryCodeSchema,
  })
  .strict();

export const recoveryRegisterOptionsRequestSchema = z
  .object({
    recoveryToken: recoveryTokenSchema,
  })
  .strict();

export const recoveryRegisterVerifyRequestSchema = z
  .object({
    recoveryToken: recoveryTokenSchema,
    challengeId: challengeIdSchema,
    credential: registrationCredentialSchema,
    passkeyName: z.string().min(1).max(60).default('Passkey de recuperação'),
  })
  .strict();

export const userDtoSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  timezone: z.string(),
  locale: z.string(),
  currency: z.string(),
  setupCompletedAt: z.string().nullable(),
});

export const sessionDtoSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  expiresAt: z.string(),
  current: z.boolean(),
  userAgent: z.string(),
});

export const responseMetaSchema = z.object({
  requestId: z.string().min(1),
  nextCursor: z.string().optional(),
  hasMore: z.boolean().optional(),
});

export function successSchema<T extends z.ZodType>(data: T) {
  return z.object({ data, meta: responseMetaSchema });
}

export const csrfResponseSchema = successSchema(
  z.object({
    csrfToken: z.string().min(1),
    posVid: z.string().min(1),
  }),
);

export const setupVerifyResponseSchema = successSchema(
  z.object({
    user: userDtoSchema,
    session: sessionDtoSchema,
    recoveryCodes: z.array(z.string()).length(10),
  }),
);

export const loginVerifyResponseSchema = successSchema(
  z.object({
    user: userDtoSchema,
    session: sessionDtoSchema,
  }),
);

export const recoveryVerifyResponseSchema = successSchema(
  z.object({
    recoveryToken: z.string().min(1),
    expiresAt: z.iso.datetime(),
  }),
);

export const meResponseSchema = successSchema(
  z.object({
    user: userDtoSchema,
    counts: z.object({
      passkeys: z.number().int().nonnegative(),
      activeSessions: z.number().int().nonnegative(),
    }),
  }),
);

export const sessionsResponseSchema = successSchema(z.array(sessionDtoSchema));

export type UserDto = z.infer<typeof userDtoSchema>;
export type SessionDto = z.infer<typeof sessionDtoSchema>;
