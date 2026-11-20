import { healthResponseSchema, type HealthResponse } from '@personal-os/shared';

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/v1/health', {
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Health check respondeu ${response.status}`);
  }

  return healthResponseSchema.parse(await response.json());
}
