import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const CLI_PATH = new URL('../../dist/cli.js', import.meta.url).pathname;
const EMPTY_AGENT_ENV = Object.fromEntries(
  [
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
  ].map((key) => [key, '']),
);

interface RecordedEvent {
  fields: Record<string, string>;
  headers: http.IncomingHttpHeaders;
  path: string | undefined;
}

let api: http.Server;
let recorder: http.Server;
let apiUrl: string;
let telemetryUrl: string;
let directory: string;
let events: RecordedEvent[] = [];
let apiRequests: {
  path: string | undefined;
  authorization: string | undefined;
  userAgent: string | undefined;
}[] = [];
let apiStatus = 200;
let refreshRequired = false;
let telemetryBehavior: 'ok' | 'hang' | 'reject' | 'redirect' = 'ok';

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

function close(server: http.Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

function environment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...EMPTY_AGENT_ENV,
    LINK_AUTH_FILE: join(directory, 'auth.json'),
    LINK_API_BASE_URL: apiUrl,
    LINK_AUTH_BASE_URL: apiUrl,
    LINK_ACCESS_TOKEN: 'secret-original-token',
    LINK_REFRESH_TOKEN: '',
    LINK_HTTP_PROXY: '',
    LINK_NO_REFRESH: '',
    DO_NOT_TRACK: '',
    LINK_CLI_TELEMETRY_OPTOUT: '',
    LINK_CLI_TELEMETRY_URL: telemetryUrl,
    ...extra,
  };
}

async function run(
  extra: Record<string, string> = {},
  args = ['payment-methods', 'list', '--json'],
) {
  try {
    const output = await execFileAsync(process.execPath, [CLI_PATH, ...args], {
      env: environment(extra),
      timeout: 10_000,
    });
    return { stdout: output.stdout, stderr: output.stderr, exitCode: 0 };
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

function normalizeOutput(result: Awaited<ReturnType<typeof run>>) {
  return {
    ...result,
    stdout: JSON.stringify(JSON.parse(result.stdout), (key, value) =>
      key === 'duration' ? undefined : value,
    ),
  };
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'link-telemetry-'));
  api = http.createServer((req, res) => {
    apiRequests.push({
      path: req.url,
      authorization: req.headers.authorization,
      userAgent: req.headers['user-agent'],
    });
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
    res.writeHead(apiStatus);
    res.end(
      JSON.stringify(
        apiStatus === 200
          ? { payment_details: [] }
          : { error: 'secret API error' },
      ),
    );
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
        path: req.url,
      });
      if (telemetryBehavior === 'hang') return;
      if (telemetryBehavior === 'redirect') {
        res.writeHead(307, { Location: `${apiUrl}/must-not-follow` });
        res.end();
        return;
      }
      res.writeHead(telemetryBehavior === 'reject' ? 503 : 204);
      res.end();
    });
  });
  apiUrl = await listen(api);
  telemetryUrl = `${await listen(recorder)}/0`;
});

afterAll(async () => {
  await Promise.all([api && close(api), recorder && close(recorder)]);
  if (directory) await rm(directory, { recursive: true, force: true });
});

beforeEach(() => {
  events = [];
  apiRequests = [];
  apiStatus = 200;
  refreshRequired = false;
  telemetryBehavior = 'ok';
});

describe('built CLI API telemetry', () => {
  it.each([false, true])(
    'records requests with agent attribution=%s',
    async (attributed) => {
      const result = await run(
        attributed ? { CODEX_THREAD_ID: 'private-thread-id' } : {},
      );
      expect(result.exitCode, result.stderr || result.stdout).toBe(0);
      expect(apiRequests).toHaveLength(1);
      expect(events).toHaveLength(1);
      expect(events[0].fields).toMatchObject({
        client_id: 'link-cli',
        event_name: 'API Request',
        event_value: 'success',
        operation: 'payment_methods.list',
        http_method: 'GET',
        status_code: '200',
      });
      expect(events[0].fields.ai_agent).toBe(
        attributed ? 'codex_cli' : undefined,
      );
      expect(events[0].headers.origin).toBe('link-cli');
      expect(events[0].headers['content-type']).toBe(
        'application/x-www-form-urlencoded',
      );
      expect(events[0].headers.authorization).toBeUndefined();
      expect(JSON.stringify(events)).not.toMatch(
        /secret-|private-thread-id|payment-details|127\.0\.0\.1:\d+.*payment/,
      );
    },
  );

  it('records the failed API attempt, auth refresh, and successful retry separately', async () => {
    refreshRequired = true;
    const result = await run({ LINK_REFRESH_TOKEN: 'secret-refresh-token' });
    expect(result.exitCode, result.stdout).toBe(0);
    expect(apiRequests.map((request) => request.path)).toEqual([
      '/payment-details',
      '/device/token',
      '/payment-details',
    ]);
    expect(events).toHaveLength(3);
    expect(
      events.map(({ fields }) => [
        fields.operation,
        fields.event_value,
        fields.status_code,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ['payment_methods.list', 'http_error', '401'],
        ['auth.token', 'success', '200'],
        ['payment_methods.list', 'success', '200'],
      ]),
    );
    expect(new Set(events.map(({ fields }) => fields.event_id)).size).toBe(3);
    expect(JSON.stringify(events)).not.toContain('secret-');
  });

  it('flushes HTTP failures while preserving output and exit code', async () => {
    apiStatus = 503;
    const baseline = await run({ LINK_CLI_TELEMETRY_OPTOUT: '1' });
    const tracked = await run();
    expect(normalizeOutput(tracked)).toEqual(normalizeOutput(baseline));
    expect(tracked.exitCode).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0].fields).toMatchObject({
      event_value: 'http_error',
      status_code: '503',
    });
    expect(JSON.stringify(events)).not.toContain('secret API error');
  });

  it('records a refused API connection as transport_error without a status', async () => {
    const temporary = http.createServer();
    const refusedUrl = await listen(temporary);
    await close(temporary);
    const result = await run({ LINK_API_BASE_URL: refusedUrl });
    expect(result.exitCode).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0].fields.event_value).toBe('transport_error');
    expect(events[0].fields.status_code).toBeUndefined();
  });

  it.each(['DO_NOT_TRACK', 'LINK_CLI_TELEMETRY_OPTOUT'])(
    'honors %s without removing API agent headers',
    async (key) => {
      const result = await run({ [key]: 'TrUe', CODEX_THREAD_ID: 'private' });
      expect(result.exitCode).toBe(0);
      expect(apiRequests).toHaveLength(1);
      expect(apiRequests[0].userAgent).toContain('AIAgent/codex_cli');
      expect(events).toHaveLength(0);
    },
  );

  it('produces no events for help or pre-request validation failure', async () => {
    expect((await run({}, ['--help'])).exitCode).toBe(0);
    expect(
      (await run({}, ['payment-methods', 'retrieve', '--json'])).exitCode,
    ).toBe(1);
    expect(apiRequests).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it.each(['ok', 'reject', 'redirect', 'hang'] as const)(
    'preserves successful output when telemetry behavior is %s',
    async (behavior) => {
      const baseline = await run({ LINK_CLI_TELEMETRY_OPTOUT: '1' });
      telemetryBehavior = behavior;
      const started = performance.now();
      const tracked = await run();
      expect(performance.now() - started).toBeLessThan(2_500);
      expect(normalizeOutput(tracked)).toEqual(normalizeOutput(baseline));
      expect(apiRequests.map((request) => request.path)).toEqual([
        '/payment-details',
        '/payment-details',
      ]);
      expect(events).toHaveLength(1);
    },
  );

  it('silently disables invalid telemetry overrides without affecting API requests', async () => {
    const result = await run({ LINK_CLI_TELEMETRY_URL: 'invalid-url' });
    expect(result.exitCode).toBe(0);
    expect(apiRequests).toHaveLength(1);
    expect(events).toHaveLength(0);
  });

  it('bounds shutdown when the telemetry TLS handshake stalls', async () => {
    const sockets = new Set<net.Socket>();
    const stalled = net.createServer((socket) => {
      sockets.add(socket);
      socket.on('error', () => {});
      socket.on('close', () => sockets.delete(socket));
      // Accept TCP without ever answering the client's TLS handshake.
      socket.resume();
    });
    await new Promise<void>((resolve, reject) => {
      stalled.once('error', reject);
      stalled.listen(0, '127.0.0.1', resolve);
    });
    try {
      const port = (stalled.address() as net.AddressInfo).port;
      const started = performance.now();
      const result = await run({
        LINK_CLI_TELEMETRY_URL: `https://127.0.0.1:${port}/0`,
      });
      expect(result.exitCode).toBe(0);
      expect(performance.now() - started).toBeLessThan(2_500);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => stalled.close(() => resolve()));
    }
  }, 15_000);

  it('sends events for concurrent MCP calls after server startup', async () => {
    const child = spawn(process.execPath, [CLI_PATH, '--mcp'], {
      env: environment(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const lines = createInterface({ input: child.stdout });
    const callbacks = new Map<number, (value: unknown) => void>();
    lines.on('line', (line) => {
      const message = JSON.parse(line) as { id: number };
      callbacks.get(message.id)?.(message);
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
            // Incur exposes unannotated commands through progressive discovery.
            name: 'call_write_tool',
            arguments: { name: 'payment-methods_list', arguments: {} },
          }),
        ),
      );
      for (const response of responses)
        expect(response, JSON.stringify(response)).toHaveProperty('result');
      await expect.poll(() => events.length).toBe(2);
      expect(apiRequests).toHaveLength(2);
      expect(new Set(events.map(({ fields }) => fields.event_id)).size).toBe(2);
      expect(
        events.every(
          ({ fields }) =>
            fields.event_value === 'success' && fields.ai_agent === undefined,
        ),
      ).toBe(true);
    } finally {
      lines.close();
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        await once(child, 'exit');
      }
    }
  }, 15_000);
});
