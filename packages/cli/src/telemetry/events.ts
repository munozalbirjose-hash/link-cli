import { randomUUID } from 'node:crypto';
import { isKnownAIAgent } from '../utils/ai-agent';

export interface CommandEvent {
  commandPath: string;
}

export interface EventMetadata {
  cliVersion: string;
  aiAgent?: string;
}

/** Only resolved command names and fixed metadata cross the analytics boundary. */
export function serializeEvent(
  metadata: EventMetadata,
  event: CommandEvent,
): URLSearchParams | undefined {
  // Incur uses underscores between command segments in MCP tool names.
  const commandPath = event.commandPath.replaceAll('_', ' ');
  if (!/^[a-z][a-z0-9-]*(?: [a-z][a-z0-9-]*)*$/.test(commandPath))
    return undefined;

  const body = new URLSearchParams();
  body.set('client_id', 'link-cli');
  body.set('event_name', 'CLI Command');
  body.set('event_id', randomUUID());
  body.set('created', String(Math.floor(Date.now() / 1000)));
  body.set('command_path', commandPath);
  body.set(
    'cli_version',
    metadata.cliVersion.length <= 100 &&
      /^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/.test(
        metadata.cliVersion,
      )
      ? metadata.cliVersion
      : 'unknown',
  );
  if (metadata.aiAgent && isKnownAIAgent(metadata.aiAgent))
    body.set('ai_agent', metadata.aiAgent);
  return body;
}
