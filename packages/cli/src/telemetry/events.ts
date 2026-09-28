import { randomUUID } from 'node:crypto';
import { isKnownAIAgent } from '../utils/ai-agent';
import {
  type HttpMethod,
  httpMethods,
  type Operation,
  operations,
} from './operations';

export type RequestEvent = {
  operation: Operation;
  httpMethod: HttpMethod;
} & (
  | { outcome: 'success' | 'http_error'; statusCode: number }
  | { outcome: 'transport_error'; statusCode?: never }
);

export interface EventMetadata {
  cliVersion: string;
  os: string;
  arch: string;
  aiAgent?: string;
}

const platforms = new Set([
  'aix',
  'android',
  'darwin',
  'freebsd',
  'haiku',
  'linux',
  'openbsd',
  'sunos',
  'win32',
  'netbsd',
  'cygwin',
]);
const architectures = new Set([
  'arm',
  'arm64',
  'ia32',
  'loong64',
  'mips',
  'mipsel',
  'ppc',
  'ppc64',
  'riscv64',
  's390',
  's390x',
  'x64',
]);

export function serializeEvent(
  metadata: EventMetadata,
  event: RequestEvent,
): URLSearchParams | undefined {
  if (
    !operations.has(event.operation) ||
    !httpMethods.includes(event.httpMethod)
  )
    return undefined;
  if (!['success', 'http_error', 'transport_error'].includes(event.outcome))
    return undefined;
  if (event.outcome !== 'transport_error') {
    if (
      !Number.isInteger(event.statusCode) ||
      event.statusCode < 100 ||
      event.statusCode > 599
    )
      return undefined;
    if (
      (event.statusCode >= 200 && event.statusCode < 300) !==
      (event.outcome === 'success')
    )
      return undefined;
  }

  // Explicit projection is the privacy boundary; TypeScript alone is not.
  const body = new URLSearchParams();
  body.set('client_id', 'link-cli');
  body.set('event_name', 'API Request');
  body.set('event_value', event.outcome);
  body.set('event_id', randomUUID());
  body.set('created', String(Math.floor(Date.now() / 1000)));
  body.set('operation', event.operation);
  body.set('http_method', event.httpMethod);
  if (event.outcome !== 'transport_error')
    body.set('status_code', String(event.statusCode));
  body.set(
    'cli_version',
    metadata.cliVersion.length <= 100 &&
      /^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/.test(
        metadata.cliVersion,
      )
      ? metadata.cliVersion
      : 'unknown',
  );
  body.set('os', platforms.has(metadata.os) ? metadata.os : 'unknown');
  body.set(
    'arch',
    architectures.has(metadata.arch) ? metadata.arch : 'unknown',
  );
  if (metadata.aiAgent && isKnownAIAgent(metadata.aiAgent))
    body.set('ai_agent', metadata.aiAgent);
  return body;
}
