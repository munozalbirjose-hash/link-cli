import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTelemetry } from '../client';
import type { RequestEvent } from '../events';
import type { postTelemetry } from '../transport';

const event: RequestEvent = {
  operation: 'payment_methods.list',
  httpMethod: 'GET',
  outcome: 'success',
  statusCode: 200,
};
afterEach(() => vi.useRealTimers());

describe('AEL client', () => {
  it.each([undefined, 'codex_cli'])(
    'sends the same number of events with agent %s',
    async (aiAgent) => {
      const transport = vi.fn<typeof postTelemetry>().mockResolvedValue();
      const client = createTelemetry({
        cliVersion: '0.23.1',
        aiAgent,
        env: {},
        transport,
      });
      client.send(event);
      await client.flush();
      expect(transport).toHaveBeenCalledTimes(1);
      const [url, body, signal] = transport.mock.calls[0];
      expect(String(url)).toBe('https://r.stripe.com/0');
      expect(signal.aborted).toBe(false);
      expect(body.get('ai_agent')).toBe(aiAgent ?? null);
    },
  );

  it.each([
    { DO_NOT_TRACK: '1' },
    { LINK_CLI_TELEMETRY_OPTOUT: 'TRUE' },
    { LINK_CLI_TELEMETRY_URL: 'bad-url' },
    { LINK_CLI_TELEMETRY_URL: '' },
    { LINK_CLI_TELEMETRY_URL: 'file:///tmp/secret' },
    { LINK_CLI_TELEMETRY_URL: 'https://user:secret@example.com' },
  ])('does no work when disabled: %j', async (env) => {
    const transport = vi.fn<typeof postTelemetry>();
    const client = createTelemetry({
      cliVersion: '0.23.1',
      env,
      transport,
    });
    const brokenEvent = {
      get operation() {
        throw new Error('must not inspect');
      },
    } as unknown as RequestEvent;
    expect(client.disabled).toBe(true);
    expect(() => client.send(brokenEvent)).not.toThrow();
    await client.flush();
    expect(transport).not.toHaveBeenCalled();
  });

  it('swallows serialization failures, synchronous transport failures, and refusals without retries', async () => {
    const transport = vi
      .fn<typeof postTelemetry>()
      .mockImplementationOnce(() => {
        throw new Error('sync');
      })
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const client = createTelemetry({
      cliVersion: '0.23.1',
      env: {},
      transport,
    });
    client.send({
      get operation() {
        throw new Error('cannot serialize');
      },
    } as unknown as RequestEvent);
    client.send(event);
    client.send(event);
    await expect(client.flush()).resolves.toBeUndefined();
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('aborts requests at three seconds even if the transport does not settle', async () => {
    vi.useFakeTimers();
    const transport = vi
      .fn<typeof postTelemetry>()
      .mockImplementation(() => new Promise(() => {}));
    const client = createTelemetry({
      cliVersion: '0.23.1',
      env: {},
      transport,
    });
    client.send(event);
    await vi.advanceTimersByTimeAsync(2_999);
    const signal = transport.mock.calls[0][2];
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal.aborted).toBe(true);
    await client.flush();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('caps concurrency, bounds flush to 300 ms, and remains usable afterward', async () => {
    vi.useFakeTimers();
    const transport = vi
      .fn<typeof postTelemetry>()
      .mockImplementation(() => new Promise(() => {}));
    const client = createTelemetry({
      cliVersion: '0.23.1',
      env: {},
      transport,
    });
    for (let i = 0; i < 12; i++) client.send(event);
    await vi.advanceTimersByTimeAsync(0);
    expect(transport).toHaveBeenCalledTimes(8);
    const flushed = client.flush();
    await vi.advanceTimersByTimeAsync(300);
    await flushed;
    expect(transport.mock.calls.every(([, , signal]) => signal.aborted)).toBe(
      true,
    );
    expect(vi.getTimerCount()).toBe(0);
    transport.mockResolvedValue();
    client.send(event);
    await client.flush();
    expect(transport).toHaveBeenCalledTimes(9);
  });
});
