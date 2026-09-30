import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Link from '@/client';
import { LinkApiError, LinkResponseError, LinkSdkError } from '@/errors';
import { ShippingAddressResource } from '@/resources/shipping-address';
import type { UpdateShippingAddressParams } from '@/types/index';

const mockFetch = vi.fn();
const getAccessToken = vi.fn();

function mockFetchResponse(status: number, body: Record<string, unknown>) {
  mockFetch.mockResolvedValue({
    status,
    text: async () => JSON.stringify(body),
  });
}

describe('ShippingAddressResource', () => {
  let repo: ShippingAddressResource;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    vi.clearAllMocks();
    getAccessToken.mockResolvedValue('test_token');
    repo = new ShippingAddressResource({ getAccessToken });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists shipping addresses from the expected endpoint', async () => {
    mockFetchResponse(200, {
      shipping_addresses: [
        {
          id: 'shad_123',
          is_default: true,
          nickname: 'Home',
          address: {
            name: 'Jane Doe',
            line_1: '123 Main St',
            line_2: 'Apt 4B',
            locality: 'San Francisco',
            dependent_locality: null,
            administrative_area: 'CA',
            postal_code: '94105',
            sorting_code: null,
            country_code: 'US',
          },
        },
      ],
    });

    const result = await repo.list();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe('https://api.link.com/shipping_addresses');
    expect(opts.method).toBe('GET');
    expect(opts.headers.Authorization).toBe('Bearer test_token');
    expect(result).toEqual([
      {
        id: 'shad_123',
        is_default: true,
        nickname: 'Home',
        address: {
          name: 'Jane Doe',
          line_1: '123 Main St',
          line_2: 'Apt 4B',
          locality: 'San Francisco',
          dependent_locality: null,
          administrative_area: 'CA',
          postal_code: '94105',
          sorting_code: null,
          country_code: 'US',
        },
      },
    ]);
  });

  it('preserves null nickname and address fields', async () => {
    mockFetchResponse(200, {
      shipping_addresses: [
        {
          id: 'shad_456',
          is_default: false,
          nickname: null,
          address: null,
        },
      ],
    });

    await expect(repo.list()).resolves.toEqual([
      {
        id: 'shad_456',
        is_default: false,
        nickname: null,
        address: null,
      },
    ]);
  });

  it('refreshes the token and retries once on 401', async () => {
    mockFetch
      .mockResolvedValueOnce({
        status: 401,
        text: async () => JSON.stringify({ error: 'expired_token' }),
      })
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({ shipping_addresses: [] }),
      });
    getAccessToken
      .mockResolvedValueOnce('test_token')
      .mockResolvedValueOnce('fresh_token');

    const result = await repo.list();

    expect(result).toEqual([]);
    expect(getAccessToken).toHaveBeenNthCalledWith(1);
    expect(getAccessToken).toHaveBeenNthCalledWith(2, { forceRefresh: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1]![1].headers.Authorization).toBe(
      'Bearer fresh_token',
    );
  });

  it('throws API errors with the response message', async () => {
    mockFetchResponse(403, { message: 'Forbidden' });

    await expect(repo.list()).rejects.toThrow(
      'Failed to list shipping addresses (403): Forbidden',
    );
  });

  it('extracts message from nested error object instead of [object Object]', async () => {
    mockFetchResponse(400, { error: { message: 'address not supported' } });

    await expect(repo.list()).rejects.toThrow(
      'Failed to list shipping addresses (400): address not supported',
    );
  });

  it('throws when no access token is available', async () => {
    getAccessToken.mockRejectedValueOnce(new Error('Missing access token'));

    await expect(repo.list()).rejects.toThrow('Missing access token');
  });

  describe('update', () => {
    const updated = {
      id: 'shad_123',
      is_default: false,
      nickname: null,
      address: { name: 'Jane Doe', line_2: '', country_code: 'US' },
    };

    it.each([
      {
        address: {
          name: ' Jane Doe ',
          country_code: 'US',
          line_1: '123 Main St',
          line_2: '',
          locality: 'Boston',
          administrative_area: 'MA',
          postal_code: '02110',
        },
      },
      { address: { line_2: '' }, is_default: false },
      { address: { locality: 'Boston' } },
      { is_default: true },
      { is_default: false },
    ])('serializes only supplied fields: %j', async (params) => {
      mockFetchResponse(200, updated);
      const client = new Link({ getAccessToken });
      await expect(
        client.shippingAddresses.update('shad/../other', params),
      ).resolves.toEqual(updated);
      expect(mockFetch).toHaveBeenCalledExactlyOnceWith(
        'https://api.link.com/shipping_addresses/shad%2F..%2Fother',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test_token',
          },
          body: JSON.stringify(params),
        }),
      );
    });

    it('strips fields outside the editable surface without changing the input', async () => {
      mockFetchResponse(200, updated);
      const params = {
        address: {
          locality: 'Boston',
          dependent_locality: 'hidden',
          sorting_code: 'hidden',
        },
        nickname: 'hidden',
      };
      await repo.update('shad_123', params);
      expect(JSON.parse(mockFetch.mock.calls[0]![1].body)).toEqual({
        address: { locality: 'Boston' },
      });
      expect(params.address.dependent_locality).toBe('hidden');
    });

    it('omits an empty address on a default-only update', async () => {
      mockFetchResponse(200, updated);
      await repo.update('shad_123', { address: {}, is_default: false });
      expect(JSON.parse(mockFetch.mock.calls[0]![1].body)).toEqual({
        is_default: false,
      });
    });

    it.each([
      {},
      { address: {} },
      { address: { line_2: undefined } },
      { address: { line_2: null } },
      { address: null },
      { is_default: null },
      { address: { line_2: 42 } },
      { address: { dependent_locality: 'hidden' } },
    ])(
      'rejects invalid or empty updates before fetching: %j',
      async (params) => {
        await expect(
          repo.update('shad_123', params as UpdateShippingAddressParams),
        ).rejects.toBeInstanceOf(LinkSdkError);
        expect(mockFetch).not.toHaveBeenCalled();
      },
    );

    it.each([400, 403, 404, 500])(
      'preserves API errors (%s)',
      async (status) => {
        const details = { error: { message: 'Update unavailable' } };
        mockFetchResponse(status, details);
        const error = await repo
          .update('shad_123', { is_default: false })
          .catch((error: unknown) => error);
        expect(error).toBeInstanceOf(LinkApiError);
        expect(error).toMatchObject({
          status,
          details,
          rawBody: JSON.stringify(details),
        });
      },
    );

    it.each([
      {},
      { ...updated, id: 42 },
      { ...updated, address: { line_2: 42 } },
    ])('rejects malformed success responses: %j', async (body) => {
      mockFetchResponse(200, body);
      await expect(
        repo.update('shad_123', { is_default: true }),
      ).rejects.toBeInstanceOf(LinkResponseError);
    });

    it.each([200, 401])(
      'refreshes once and replays the same body (then %s)',
      async (status) => {
        mockFetch
          .mockResolvedValueOnce({ status: 401, text: async () => '{}' })
          .mockResolvedValueOnce({
            status,
            text: async () => JSON.stringify(updated),
          });
        getAccessToken
          .mockResolvedValueOnce('old')
          .mockResolvedValueOnce('new');
        const result = repo.update('shad_123', {
          address: { line_2: '' },
          is_default: false,
        });
        if (status === 200) await expect(result).resolves.toEqual(updated);
        else await expect(result).rejects.toBeInstanceOf(LinkApiError);
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(getAccessToken).toHaveBeenLastCalledWith({ forceRefresh: true });
        expect(mockFetch.mock.calls[1]![1].body).toBe(
          mockFetch.mock.calls[0]![1].body,
        );
        expect(mockFetch.mock.calls[1]![1].headers.Authorization).toBe(
          'Bearer new',
        );
      },
    );
  });
});
