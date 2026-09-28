import { describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '../events';
import { createTelemetryFetch } from '../fetch';

function recorder() {
  return {
    disabled: false,
    send: vi.fn<(event: RequestEvent) => void>(),
    flush: async () => {},
  };
}

describe('telemetry fetch', () => {
  it.each([200, 204, 299, 302, 400, 401, 429, 500])(
    'records HTTP %s without consuming or replacing the response',
    async (status) => {
      const telemetry = recorder();
      const response = new Response(status === 204 ? null : 'original-body', {
        status,
      });
      const baseFetch = vi.fn<typeof fetch>().mockResolvedValue(response);
      const wrapped = createTelemetryFetch(baseFetch, telemetry, [
        'https://api.link.com',
      ]);
      const signal = new AbortController().signal;
      const init = {
        headers: { Authorization: 'secret' },
        signal,
        redirect: 'manual' as const,
      };
      expect(await wrapped('https://api.link.com/payment-details', init)).toBe(
        response,
      );
      expect(baseFetch).toHaveBeenCalledExactlyOnceWith(
        'https://api.link.com/payment-details',
        init,
      );
      expect(response.bodyUsed).toBe(false);
      expect(await response.text()).toBe(status === 204 ? '' : 'original-body');
      expect(telemetry.send).toHaveBeenCalledExactlyOnceWith({
        operation: 'payment_methods.list',
        httpMethod: 'GET',
        outcome: status < 300 ? 'success' : 'http_error',
        statusCode: status,
      });
    },
  );

  it.each([
    new Error('secret network failure'),
    new DOMException('secret cancellation', 'AbortError'),
  ])(
    'preserves rejected errors without logging their contents',
    async (error) => {
      const telemetry = recorder();
      const baseFetch = vi.fn<typeof fetch>().mockRejectedValue(error);
      const wrapped = createTelemetryFetch(baseFetch, telemetry, [
        'https://api.link.com',
      ]);
      await expect(
        wrapped('https://api.link.com/payment-details'),
      ).rejects.toBe(error);
      expect(telemetry.send).toHaveBeenCalledExactlyOnceWith({
        operation: 'payment_methods.list',
        httpMethod: 'GET',
        outcome: 'transport_error',
      });
    },
  );

  it('records each concurrent request and repeated polling attempt independently', async () => {
    const telemetry = recorder();
    const wrapped = createTelemetryFetch(
      vi.fn<typeof fetch>().mockImplementation(async () => new Response('{}')),
      telemetry,
      ['https://api.link.com'],
    );
    await Promise.all(
      Array.from({ length: 5 }, () =>
        wrapped('https://api.link.com/spend_requests/id'),
      ),
    );
    expect(telemetry.send).toHaveBeenCalledTimes(5);
  });

  it('does not turn broken response bodies into transport failures', async () => {
    const telemetry = recorder();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error('broken body'));
        },
      }),
    );
    const wrapped = createTelemetryFetch(
      vi.fn<typeof fetch>().mockResolvedValue(response),
      telemetry,
      ['https://api.link.com'],
    );
    const result = await wrapped('https://api.link.com/payment-details');
    await expect(result.text()).rejects.toThrow('broken body');
    expect(telemetry.send).toHaveBeenCalledExactlyOnceWith({
      operation: 'payment_methods.list',
      httpMethod: 'GET',
      outcome: 'success',
      statusCode: 200,
    });
  });

  it('preserves outcomes if the telemetry sender throws', async () => {
    const telemetry = recorder();
    telemetry.send.mockImplementation(() => {
      throw new Error('telemetry failed');
    });
    const response = new Response('{}');
    const error = new Error('original');
    const baseFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response)
      .mockRejectedValueOnce(error);
    const wrapped = createTelemetryFetch(baseFetch, telemetry, [
      'https://api.link.com',
    ]);
    expect(await wrapped('https://api.link.com/payment-details')).toBe(
      response,
    );
    await expect(wrapped('https://api.link.com/payment-details')).rejects.toBe(
      error,
    );
  });

  it('passes through merchant requests and returns the original fetch when disabled', async () => {
    const telemetry = recorder();
    const baseFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{}'));
    const wrapped = createTelemetryFetch(baseFetch, telemetry, [
      'https://api.link.com',
    ]);
    await wrapped('https://merchant.example/pay');
    expect(telemetry.send).not.toHaveBeenCalled();
    expect(
      createTelemetryFetch(baseFetch, { ...telemetry, disabled: true }, [
        'invalid',
      ]),
    ).toBe(baseFetch);
  });
});
