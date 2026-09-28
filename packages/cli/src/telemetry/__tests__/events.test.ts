import { describe, expect, it } from 'vitest';
import {
  type EventMetadata,
  type RequestEvent,
  serializeEvent,
} from '../events';
import { createRequestClassifier } from '../operations';
import { telemetryOptedOut } from '../opt-out';

const metadata: EventMetadata = {
  cliVersion: '0.23.1',
  os: 'linux',
  arch: 'x64',
};
const event: RequestEvent = {
  operation: 'payment_methods.list',
  httpMethod: 'GET',
  outcome: 'success',
  statusCode: 200,
};

describe('event privacy', () => {
  it.each([undefined, 'codex_cli'])(
    'serializes exact fields with agent %s',
    (aiAgent) => {
      const body = serializeEvent({ ...metadata, aiAgent }, event);
      expect(body).toBeDefined();
      const fields = Object.fromEntries(body ?? []);
      expect(fields).toEqual({
        client_id: 'link-cli',
        event_name: 'API Request',
        event_value: 'success',
        event_id: expect.stringMatching(
          /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/,
        ),
        created: String(Math.floor(Date.now() / 1000)),
        operation: 'payment_methods.list',
        http_method: 'GET',
        status_code: '200',
        cli_version: '0.23.1',
        os: 'linux',
        arch: 'x64',
        ...(aiAgent ? { ai_agent: aiAgent } : {}),
      });
      expect(body?.toString()).toContain('event_name=API+Request');
    },
  );

  it('projects fields instead of serializing extra sensitive properties', () => {
    const secret =
      'secret-token https://private.example/customer exception stack';
    const extras = {
      url: secret,
      token: secret,
      headers: { Authorization: secret },
      body: secret,
      message: secret,
      stack: secret,
    };
    const body = serializeEvent(
      { ...metadata, ...extras },
      { ...event, ...extras },
    );
    expect(body?.toString()).not.toContain('secret');
    for (const key of Object.keys(extras)) expect(body?.has(key)).toBe(false);
    expect(body?.get('operation')).toBe('payment_methods.list');
  });

  it('omits status for transport failures and generates independent event IDs', () => {
    const failure: RequestEvent = {
      operation: 'auth.token',
      httpMethod: 'POST',
      outcome: 'transport_error',
    };
    const first = serializeEvent(metadata, failure);
    const second = serializeEvent(metadata, failure);
    expect(first?.has('status_code')).toBe(false);
    expect(first?.get('event_id')).not.toBe(second?.get('event_id'));
  });

  it('bounds metadata at runtime', () => {
    const body = serializeEvent(
      {
        cliVersion: 'https://secret',
        aiAgent: 'secret-agent',
        os: 'secret-os',
        arch: 'secret-arch',
      },
      event,
    );
    expect(body?.get('cli_version')).toBe('unknown');
    expect(body?.get('os')).toBe('unknown');
    expect(body?.get('arch')).toBe('unknown');
    expect(body?.has('ai_agent')).toBe(false);
  });

  it.each([
    { operation: 'secret-operation' },
    { httpMethod: 'secret-method' },
    { outcome: 'secret-error' },
    { statusCode: 700 },
    { statusCode: 200.5 },
    { statusCode: 500 },
  ])('rejects invalid event fields: %j', (extra) => {
    expect(
      serializeEvent(metadata, { ...event, ...extra } as RequestEvent),
    ).toBeUndefined();
  });
});

describe('request classification', () => {
  const classify = createRequestClassifier([
    'https://api.link.com',
    'http://localhost:1234/api/v1',
    'https://login.link.com',
    'bad-url',
  ]);
  it.each([
    [
      'https://api.link.com/payment-details?token=secret',
      'GET',
      'payment_methods.list',
    ],
    [
      'https://api.link.com/payment-details/pd_secret',
      'POST',
      'payment_methods.update',
    ],
    [
      'https://api.link.com/spend_requests/lsrq_secret/cancel',
      'POST',
      'spend_requests.cancel',
    ],
    [
      'http://localhost:1234/api/v1/spend_requests/lsrq_secret?expand=secret',
      'GET',
      'spend_requests.retrieve',
    ],
    ['https://login.link.com/device/token', 'POST', 'auth.token'],
    ['https://api.link.com/ucp/checkout/id/complete', 'POST', 'ucp.complete'],
    ['https://api.link.com/new/private/route', 'GET', 'unknown'],
  ])('maps %s to a fixed name', (url, method, operation) => {
    expect(classify(url, { method })).toEqual({
      operation,
      httpMethod: method,
    });
  });
  it.each([
    'https://api.link.com.evil.test/payment-details',
    'http://api.link.com/payment-details',
    'http://localhost:1234/api/v10/payment-details',
    'https://merchant.test/pay',
    'not a url',
  ])('ignores untracked URLs: %s', (url) => {
    expect(classify(url)).toBeUndefined();
  });
  it('supports URL and Request inputs and method overrides', () => {
    expect(
      classify(new URL('https://api.link.com/payment-details'))?.operation,
    ).toBe('payment_methods.list');
    const request = new Request('https://api.link.com/payment-details/id', {
      method: 'POST',
    });
    expect(classify(request)?.operation).toBe('payment_methods.update');
    expect(classify(request, { method: 'GET' })?.operation).toBe(
      'payment_methods.retrieve',
    );
    expect(classify(request, { method: 'SECRET' })).toEqual({
      operation: 'unknown',
      httpMethod: 'unknown',
    });
  });
});

describe('opt-out', () => {
  for (const key of ['DO_NOT_TRACK', 'LINK_CLI_TELEMETRY_OPTOUT']) {
    it.each(['1', 'true', 'TRUE', 'TrUe'])(`honors ${key}=%s`, (value) => {
      expect(telemetryOptedOut({ [key]: value })).toBe(true);
    });
    it.each([undefined, '', '0', 'false', 'FALSE', 'yes'])(
      `leaves telemetry enabled for ${key}=%s`,
      (value) => {
        expect(telemetryOptedOut({ [key]: value })).toBe(false);
      },
    );
  }
  it('opts out when either variable is true', () => {
    expect(
      telemetryOptedOut({
        DO_NOT_TRACK: 'true',
        LINK_CLI_TELEMETRY_OPTOUT: 'false',
      }),
    ).toBe(true);
  });
});
