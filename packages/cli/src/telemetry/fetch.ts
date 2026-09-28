import type { TelemetryClient } from './client';
import type { RequestEvent } from './events';
import { createRequestClassifier } from './operations';

export function createTelemetryFetch(
  baseFetch: typeof globalThis.fetch,
  telemetry: TelemetryClient,
  baseUrls: readonly string[],
): typeof globalThis.fetch {
  if (telemetry.disabled) return baseFetch;
  const classify = createRequestClassifier(baseUrls);
  const send = (event: RequestEvent) => {
    try {
      telemetry.send(event);
    } catch {
      /* Preserve the API outcome. */
    }
  };
  return async (input, init) => {
    const request = classify(input, init);
    let response: Response;
    try {
      response = await baseFetch(input, init);
    } catch (error) {
      if (request) send({ ...request, outcome: 'transport_error' });
      throw error;
    }
    if (request) {
      send({
        ...request,
        outcome:
          response.status >= 200 && response.status < 300
            ? 'success'
            : 'http_error',
        statusCode: response.status,
      });
    }
    return response;
  };
}
