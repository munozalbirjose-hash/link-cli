import {
  type EventMetadata,
  type RequestEvent,
  serializeEvent,
} from './events';
import { telemetryOptedOut } from './opt-out';
import { postTelemetry } from './transport';

const REQUEST_TIMEOUT_MS = 3_000;
const FLUSH_TIMEOUT_MS = 300;
const MAX_IN_FLIGHT = 8;

export interface TelemetryClient {
  readonly disabled: boolean;
  send(event: RequestEvent): void;
  flush(): Promise<void>;
}

const disabledClient: TelemetryClient = {
  disabled: true,
  send() {},
  async flush() {},
};

export function createTelemetry(options: {
  cliVersion: string;
  aiAgent?: string;
  env?: Readonly<Record<string, string | undefined>>;
  transport?: typeof postTelemetry;
}): TelemetryClient {
  const env = options.env ?? process.env;
  if (telemetryOptedOut(env)) return disabledClient;

  let endpoint: URL;
  try {
    endpoint = new URL(env.LINK_CLI_TELEMETRY_URL ?? 'https://r.stripe.com/0');
    if (
      !['http:', 'https:'].includes(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password ||
      endpoint.hash
    )
      return disabledClient;
  } catch {
    return disabledClient;
  }

  const transport = options.transport ?? postTelemetry;
  const metadata: EventMetadata = {
    cliVersion: options.cliVersion,
    aiAgent: options.aiAgent,
    os: process.platform,
    arch: process.arch,
  };
  const pending = new Set<{ done: Promise<void>; abort(): void }>();

  return {
    disabled: false,
    send(event) {
      try {
        if (pending.size >= MAX_IN_FLIGHT) return;
        const body = serializeEvent(metadata, event);
        if (!body) return;
        const controller = new AbortController();
        let resolveDone: () => void = () => {};
        const done = new Promise<void>((resolve) => {
          resolveDone = resolve;
        });
        const finish = () => {
          clearTimeout(timer);
          pending.delete(entry);
          resolveDone();
        };
        const entry = {
          done,
          abort() {
            controller.abort();
            finish();
          },
        };
        const timer = setTimeout(() => entry.abort(), REQUEST_TIMEOUT_MS);
        timer.unref();
        pending.add(entry);
        void Promise.resolve()
          .then(() => transport(endpoint, body, controller.signal))
          .catch(() => {})
          .finally(finish);
      } catch {
        // Telemetry failures must never escape into API or CLI behavior.
      }
    },
    async flush() {
      const entries = [...pending];
      if (entries.length === 0) return;
      const timer = setTimeout(() => {
        for (const entry of entries) entry.abort();
      }, FLUSH_TIMEOUT_MS);
      try {
        await Promise.all(entries.map((entry) => entry.done));
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
