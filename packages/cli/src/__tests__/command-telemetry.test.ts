import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const CLI_PATH = new URL('../../dist/cli.js', import.meta.url).pathname;
const AGENT_SIGNALS = [
  'ANTIGRAVITY_CLI_ALIAS',
  'CLAUDECODE',
  'CLINE_ACTIVE',
  'CODEX_SANDBOX',
  'CODEX_THREAD_ID',
  'CODEX_SANDBOX_NETWORK_DISABLED',
  'CODEX_CI',
  'CURSOR_AGENT',
  'GEMINI_CLI',
  'OPENCODE',
  'OPENCLAW_SHELL',
  'CLAUDE_CODE_ENTRYPOINT',
  'CODEX_INTERNAL_ORIGINATOR_OVERRIDE',
];

interface Event {
  fields: Record<string, string>;
  headers: http.IncomingHttpHeaders;
}

let api: http.Server;
let recorder: http.Server;
let apiUrl: string;
let telemetryUrl: string;
let directory: string;
let apiRequests: string[] = [];
let events: Event[] = [];
let refreshRequired = false;
let telemetryMode: 'ok' | 'hang' | 'reject' = 'ok';

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

async function close(server: http.Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function freePort(): Promise<number> {
  const server = http.createServer();
  await listen(server);
  const port = (server.address() as { port: number }).port;
  await close(server);
  return port;
}

function environment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...Object.fromEntries(AGENT_SIGNALS.map((name) => [name, ''])),
    LINK_AUTH_FILE: join(directory, 'auth.json'),
    LINK_API_BASE_URL: apiUrl,
    LINK_AUTH_BASE_URL: apiUrl,
    LINK_ACCESS_TOKEN: 'secret-original-token',
    LINK_REFRESH_TOKEN: '',
    LINK_HTTP_PROXY: '',
    DO_NOT_TRACK: '',
    LINK_CLI_TELEMETRY_OPTOUT: '',
    LINK_CLI_TELEMETRY_URL: telemetryUrl,
    ...extra,
  };
}

async function run(
  args: string[],
  extra: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await execFileAsync(process.execPath, [CLI_PATH, ...args], {
      env: environment(extra),
      timeout: 10_000,
    });
    return { ...result, exitCode: 0 };
  } catch (error) {
    const failure = error as {
      stdout: string;
      stderr: string;
      code?: number | string;
    };
    if (typeof failure.code !== 'number') throw error;
    return {
      stdout: failure.stdout,
      stderr: failure.stderr,
      exitCode: failure.code,
    };
  }
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'link-command-telemetry-'));
  api = http.createServer((req, res) => {
    apiRequests.push(req.url ?? '');
    req.resume();
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/device/token') {
      res.end(
        JSON.stringify({
          access_token: 'secret-refreshed-token',
          refresh_token: 'secret-refresh',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      );
      return;
    }
    if (
      refreshRequired &&
      req.headers.authorization !== 'Bearer secret-refreshed-token'
    ) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'expired' }));
      return;
    }
    res.end(JSON.stringify({ payment_details: [] }));
  });
  recorder = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      events.push({
        fields: Object.fromEntries(new URLSearchParams(body)),
        headers: req.headers,
      });
      if (telemetryMode === 'hang') return;
      res.writeHead(telemetryMode === 'reject' ? 503 : 204);
      res.end();
    });
  });
  apiUrl = await listen(api);
  telemetryUrl = `${await listen(recorder)}/0`;
});

afterAll(async () => {
  await Promise.all([close(api), close(recorder)]);
  await rm(directory, { recursive: true, force: true });
});

beforeEach(() => {
  apiRequests = [];
  events = [];
  refreshRequired = false;
  telemetryMode = 'ok';
});

describe('built CLI command telemetry', () => {
  it('records one safe event for a command without an API request', async () => {
    const result = await run(['auth', 'status', '--json'], {
      CODEX_THREAD_ID: 'private-thread-id',
    });
    expect(result.exitCode, result.stderr || result.stdout).toBe(0);
    expect(apiRequests).toHaveLength(0);
    expect(events).toHaveLength(1);
    expect(events[0].fields).toMatchObject({
      client_id: 'link-cli',
      event_name: 'CLI Command',
      command_path: 'auth status',
      ai_agent: 'codex_cli',
    });
    expect(events[0].fields.cli_version).toMatch(/^\d+\.\d+\.\d+/);
    expect(events[0].fields.event_id).toMatch(/^[a-f\d-]{36}$/);
    expect(Number(events[0].fields.created)).toBeGreaterThan(0);
    expect(events[0].headers.origin).toBe('link-cli');
    expect(events[0].headers.authorization).toBeUndefined();
    expect(JSON.stringify(events)).not.toMatch(/secret-|private-thread-id/);
  });

  it('counts one command despite an API retry and token refresh', async () => {
    refreshRequired = true;
    const result = await run(['payment-methods', 'list', '--json'], {
      LINK_REFRESH_TOKEN: 'secret-refresh-token',
    });
    expect(result.exitCode, result.stderr || result.stdout).toBe(0);
    expect(apiRequests).toHaveLength(3);
    expect(events).toHaveLength(1);
    expect(events[0].fields.command_path).toBe('payment-methods list');
    expect(events[0].fields.ai_agent).toBeUndefined();
    expect(JSON.stringify(events)).not.toContain('secret-');
  });

  it('counts resolved commands that fail flag validation', async () => {
    const result = await run([
      'payment-methods',
      'list',
      '--unknown',
      '--json',
    ]);
    expect(result.exitCode).toBe(1);
    expect(apiRequests).toHaveLength(0);
    expect(events).toHaveLength(1);
    expect(events[0].fields.command_path).toBe('payment-methods list');
  });

  it('skips help, version, and unknown commands', async () => {
    await run(['--help']);
    await run(['--version']);
    await run(['not-a-command']);
    expect(events).toHaveLength(0);
  }, 20_000);

  it.each<Record<string, string>>([
    { DO_NOT_TRACK: '1' },
    { LINK_CLI_TELEMETRY_OPTOUT: 'true' },
  ])('honors opt-out: %j', async (env) => {
    const result = await run(['auth', 'status', '--json'], env);
    expect(result.exitCode).toBe(0);
    expect(events).toHaveLength(0);
  });

  it.each(['hang', 'reject'] as const)(
    'preserves output and exit status when AEL %s',
    async (mode) => {
      const baseline = await run(['auth', 'status', '--json'], {
        DO_NOT_TRACK: '1',
      });
      telemetryMode = mode;
      const tracked = await run(['auth', 'status', '--json']);
      expect(tracked.exitCode).toBe(baseline.exitCode);
      expect(JSON.parse(tracked.stdout)).toMatchObject(
        JSON.parse(baseline.stdout),
      );
      expect(events).toHaveLength(1);
    },
  );

  it('records each MCP tool call without recording MCP control messages', async () => {
    const child = spawn(process.execPath, [CLI_PATH, '--mcp'], {
      env: environment(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const lines = createInterface({ input: child.stdout });
    const callbacks = new Map<number, (message: unknown) => void>();
    lines.on('line', (line) => {
      const message = JSON.parse(line) as { id?: number };
      if (message.id !== undefined) callbacks.get(message.id)?.(message);
    });
    const rpc = (id: number, method: string, params: unknown) =>
      new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`MCP ${method} timed out`)),
          5_000,
        );
        callbacks.set(id, (message) => {
          clearTimeout(timer);
          callbacks.delete(id);
          resolve(message);
        });
        child.stdin.write(
          `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`,
        );
      });
    try {
      expect(
        await rpc(1, 'initialize', {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'telemetry-test', version: '1.0.0' },
        }),
      ).toHaveProperty('result');
      child.stdin.write(
        `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`,
      );
      const responses = await Promise.all(
        [2, 3].map((id) =>
          rpc(id, 'tools/call', {
            name: 'call_write_tool',
            arguments: { name: 'payment-methods_list', arguments: {} },
          }),
        ),
      );
      for (const response of responses)
        expect(response).toHaveProperty('result');
      await expect.poll(() => events.length).toBe(2);
      expect(events.map(({ fields }) => fields.command_path)).toEqual([
        'payment-methods list',
        'payment-methods list',
      ]);
      expect(new Set(events.map(({ fields }) => fields.event_id)).size).toBe(2);
    } finally {
      lines.close();
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        await once(child, 'exit');
      }
    }
  }, 15_000);

  it('records MCP tool calls served over HTTP', async () => {
    const port = await freePort();
    const child = spawn(
      process.execPath,
      [CLI_PATH, 'serve', '--port', String(port)],
      {
        env: environment(),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    try {
      await new Promise<void>((resolve, reject) => {
        let stderr = '';
        const timer = setTimeout(() => reject(new Error(stderr)), 5_000);
        child.stderr?.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
          if (stderr.includes('link-cli MCP server listening')) {
            clearTimeout(timer);
            resolve();
          }
        });
        child.once('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`serve exited with ${code}: ${stderr}`));
        });
      });
      const rpc = async (id: number, method: string, params: unknown) => {
        const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        });
        expect(response.status).toBe(200);
        return response.json();
      };
      expect(
        await rpc(1, 'initialize', {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'telemetry-test', version: '1.0.0' },
        }),
      ).toHaveProperty('result');
      expect(
        await rpc(2, 'tools/call', {
          name: 'call_write_tool',
          arguments: { name: 'payment-methods_list', arguments: {} },
        }),
      ).toHaveProperty('result');
      await expect.poll(() => events.length).toBe(2);
      expect(events.map(({ fields }) => fields.command_path)).toEqual([
        'serve',
        'payment-methods list',
      ]);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        await once(child, 'exit');
      }
    }
  }, 15_000);
});
