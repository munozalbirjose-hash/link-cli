import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InsightsResource } from '@/resources/insights';

const mockFetch = vi.fn();
const getAccessToken = vi.fn();

const TOP_BRAND = 'top_brand_by_transaction_count_per_category_t180d';
const TOP_BRAND_DESCRIPTION =
  'Top brands from shopping categories in the last 180 days based on transaction count';
const TRANSACTION_REMEDIATION = {
  authorization_details: [
    {
      type: 'source',
      actions: ['read_link_transactions', 'read_external_transactions'],
    },
  ],
};

function mockFetchResponse(status: number, body: unknown) {
  mockFetch.mockResolvedValue({
    status,
    statusText: '',
    headers: new Headers(),
    text: async () => JSON.stringify(body),
  });
}

describe('InsightsResource', () => {
  let repo: InsightsResource;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    vi.clearAllMocks();
    vi.stubEnv('LINK_API_BASE_URL', undefined);
    getAccessToken.mockResolvedValue('test_token');
    repo = new InsightsResource({ getAccessToken });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe('listAvailableTypes', () => {
    it('GETs available insight types with bearer auth and no default query', async () => {
      const page = {
        data: [{ id: TOP_BRAND, description: TOP_BRAND_DESCRIPTION }],
        has_more: false,
      };
      mockFetchResponse(200, page);

      const result = await repo.listAvailableTypes();

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.link.com/insights/available_types');
      expect(opts.method).toBe('GET');
      expect(opts.headers.Authorization).toBe('Bearer test_token');
      expect(result).toEqual(page);
    });

    it('encodes pagination params', async () => {
      mockFetchResponse(200, { data: [], has_more: false });

      await repo.listAvailableTypes({ limit: 100, starting_after: TOP_BRAND });

      const url = new URL(mockFetch.mock.calls[0]![0]);
      expect(url.pathname).toBe('/insights/available_types');
      expect(url.searchParams.get('limit')).toBe('100');
      expect(url.searchParams.get('starting_after')).toBe(TOP_BRAND);
    });

    it('preserves authorization remediation and additive fields', async () => {
      const page = {
        data: [
          {
            id: TOP_BRAND,
            description: TOP_BRAND_DESCRIPTION,
            authorization_remediation: {
              scope: ['future:scope'],
              authorization_details: [
                {
                  type: 'source',
                  actions: ['read_link_transactions'],
                  locations: ['https://api.link.com'],
                },
              ],
              reason: 'future_field',
            },
            category: 'shopping',
          },
        ],
        has_more: true,
        url: '/insights/available_types',
      };
      mockFetchResponse(200, page);

      await expect(repo.listAvailableTypes()).resolves.toEqual(page);
    });

    it('treats null remediation as absent', async () => {
      mockFetchResponse(200, {
        data: [
          {
            id: TOP_BRAND,
            description: TOP_BRAND_DESCRIPTION,
            authorization_remediation: null,
          },
        ],
        has_more: false,
      });

      const result = await repo.listAvailableTypes();

      expect(result.data[0]?.authorization_remediation).toBeNull();
    });

    it.each([
      ['a missing has_more', { data: [] }],
      ['a legacy bare array', [{ id: TOP_BRAND, description: 'x' }]],
      [
        'a type without an id',
        { data: [{ description: 'x' }], has_more: false },
      ],
      [
        'remediation details without a type',
        {
          data: [
            {
              id: TOP_BRAND,
              description: 'x',
              authorization_remediation: {
                authorization_details: [
                  { actions: ['read_link_transactions'] },
                ],
              },
            },
          ],
          has_more: false,
        },
      ],
    ])('rejects %s', async (_name, body) => {
      mockFetchResponse(200, body);

      await expect(repo.listAvailableTypes()).rejects.toMatchObject({
        code: 'invalid_response',
        status: 200,
      });
    });

    it('throws API errors with the response message', async () => {
      mockFetchResponse(404, {
        error: { message: 'Unrecognized request URL' },
      });

      await expect(repo.listAvailableTypes()).rejects.toThrow(
        'Failed to list available insight types (404): Unrecognized request URL',
      );
    });
  });

  describe('list', () => {
    it('GETs insight results and returns a ready number_of_items result', async () => {
      const page = {
        data: [
          {
            status: 'ready',
            as_of: 1790723779,
            id: TOP_BRAND,
            description: TOP_BRAND_DESCRIPTION,
            data: [
              {
                label:
                  'Top brand from Clothing and accessories shopping category',
                value: {
                  type: 'number_of_items',
                  number_of_items: { label: 'J.crew', count: 10 },
                },
              },
              {
                label: 'Top brand from Department stores shopping category',
                value: {
                  type: 'number_of_items',
                  number_of_items: { label: 'Nordstrom', count: 5 },
                },
              },
            ],
          },
        ],
        has_more: false,
      };
      mockFetchResponse(200, page);

      const result = await repo.list();

      const [url, opts] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.link.com/insights');
      expect(opts.method).toBe('GET');
      expect(opts.headers.Authorization).toBe('Bearer test_token');
      expect(result).toEqual(page);
    });

    it('encodes repeated insight filters and pagination', async () => {
      mockFetchResponse(200, { data: [], has_more: false });

      await repo.list({
        insights: [TOP_BRAND, 'future_insight'],
        limit: 1,
        starting_after: 'cursor_insight',
      });

      const url = new URL(mockFetch.mock.calls[0]![0]);
      expect(url.pathname).toBe('/insights');
      expect(url.searchParams.getAll('insights[]')).toEqual([
        TOP_BRAND,
        'future_insight',
      ]);
      expect(url.searchParams.get('limit')).toBe('1');
      expect(url.searchParams.get('starting_after')).toBe('cursor_insight');
      expect(url.searchParams.has('insights')).toBe(false);
    });

    it('distinguishes pending, missing permissions, internal errors, and no data', async () => {
      const page = {
        data: [
          { status: 'pending', id: 'pending_insight', description: 'Pending' },
          {
            status: 'no_data',
            as_of: 1790723779,
            id: TOP_BRAND,
            description: TOP_BRAND_DESCRIPTION,
            error_code: 'missing_permissions',
            error_message:
              'Grant transaction access to a Link payment detail to compute this insight.',
            authorization_remediation: TRANSACTION_REMEDIATION,
            data: [],
          },
          {
            status: 'no_data',
            as_of: 1790723779,
            id: 'failed_insight',
            description: 'Failed',
            error_code: 'internal_error',
            error_message: 'Could not compute this insight.',
            data: [],
          },
          {
            status: 'no_data',
            as_of: 1790723779,
            id: 'empty_insight',
            description: 'Empty',
            data: [],
          },
        ],
        has_more: false,
      };
      mockFetchResponse(200, page);

      const result = await repo.list();

      expect(result).toEqual(page);
      expect(result.data.map((insight) => insight.status)).toEqual([
        'pending',
        'no_data',
        'no_data',
        'no_data',
      ]);
      expect(result.data[0]).not.toHaveProperty('data');
      expect(result.data[1]?.authorization_remediation).toEqual(
        TRANSACTION_REMEDIATION,
      );
      expect(result.data[3]?.error_code).toBeUndefined();
    });

    it('preserves unknown statuses, error codes, value types, and fields', async () => {
      const page = {
        data: [
          {
            status: 'stale',
            id: 'future_insight',
            description: 'Future',
            error_code: 'future_error',
            as_of: 1790723779,
            data: [
              {
                label: 'Monthly volume',
                value: {
                  type: 'payment_volume',
                  payment_volume: { amount: 1234, currency: 'usd' },
                },
                rank: 1,
              },
              {
                label: 'Summary',
                value: { type: 'text', text: 'Mostly groceries' },
              },
              {
                label: 'Count',
                value: {
                  type: 'number_of_items',
                  number_of_items: { count: 2, unit: 'transactions' },
                },
              },
            ],
            window: 't180d',
          },
        ],
        has_more: true,
        next_page: 'future',
      };
      mockFetchResponse(200, page);

      await expect(repo.list()).resolves.toEqual(page);
    });

    it('accepts null optional fields', async () => {
      mockFetchResponse(200, {
        data: [
          {
            status: 'pending',
            id: TOP_BRAND,
            description: TOP_BRAND_DESCRIPTION,
            error_code: null,
            error_message: null,
            authorization_remediation: null,
            as_of: null,
            data: null,
          },
        ],
        has_more: false,
      });

      const result = await repo.list();

      expect(result.data[0]?.status).toBe('pending');
      expect(result.data[0]?.data).toBeNull();
    });

    it.each([
      ['a missing has_more', { data: [] }],
      [
        'the older response contract',
        { insights: [{ type: 'top_brand', value: 'Whole Foods' }] },
      ],
      [
        'an insight without a status',
        { data: [{ id: TOP_BRAND, description: 'x' }], has_more: false },
      ],
      [
        'an entry without a label',
        {
          data: [
            {
              status: 'ready',
              id: TOP_BRAND,
              description: 'x',
              data: [{ value: { type: 'text' } }],
            },
          ],
          has_more: false,
        },
      ],
      [
        'a value without a type',
        {
          data: [
            {
              status: 'ready',
              id: TOP_BRAND,
              description: 'x',
              data: [{ label: 'x', value: { count: 4 } }],
            },
          ],
          has_more: false,
        },
      ],
      [
        'a number_of_items value without a count',
        {
          data: [
            {
              status: 'ready',
              id: TOP_BRAND,
              description: 'x',
              data: [
                {
                  label: 'x',
                  value: { type: 'number_of_items', number_of_items: {} },
                },
              ],
            },
          ],
          has_more: false,
        },
      ],
      [
        'a non-string number_of_items label',
        {
          data: [
            {
              status: 'ready',
              id: TOP_BRAND,
              description: 'x',
              data: [
                {
                  label: 'x',
                  value: {
                    type: 'number_of_items',
                    number_of_items: { label: 7, count: 4 },
                  },
                },
              ],
            },
          ],
          has_more: false,
        },
      ],
      [
        'a non-integer number_of_items count',
        {
          data: [
            {
              status: 'ready',
              id: TOP_BRAND,
              description: 'x',
              data: [
                {
                  label: 'x',
                  value: {
                    type: 'number_of_items',
                    number_of_items: { count: 4.5 },
                  },
                },
              ],
            },
          ],
          has_more: false,
        },
      ],
      [
        'a non-numeric as_of',
        {
          data: [
            {
              status: 'ready',
              id: TOP_BRAND,
              description: 'x',
              as_of: '2026-09-30',
              data: [],
            },
          ],
          has_more: false,
        },
      ],
    ])('rejects %s', async (_name, body) => {
      mockFetchResponse(200, body);

      await expect(repo.list()).rejects.toMatchObject({
        code: 'invalid_response',
        status: 200,
      });
    });

    it('throws API errors with the response message', async () => {
      mockFetchResponse(500, { message: 'boom' });

      await expect(repo.list()).rejects.toThrow(
        'Failed to list insights (500): boom',
      );
    });
  });

  it('uses an explicitly configured base URL', async () => {
    repo = new InsightsResource({
      getAccessToken,
      apiBaseUrl: 'https://api.qa.link.com',
    });
    mockFetchResponse(200, { data: [], has_more: false });

    await repo.listAvailableTypes();
    await repo.list({ insights: [TOP_BRAND] });

    expect(mockFetch.mock.calls[0]![0]).toBe(
      'https://api.qa.link.com/insights/available_types',
    );
    expect(mockFetch.mock.calls[1]![0]).toBe(
      `https://api.qa.link.com/insights?insights%5B%5D=${TOP_BRAND}`,
    );
  });

  it('refreshes the token and retries once on 401', async () => {
    mockFetch
      .mockResolvedValueOnce({
        status: 401,
        statusText: '',
        headers: new Headers(),
        text: async () => JSON.stringify({ error: 'expired_token' }),
      })
      .mockResolvedValueOnce({
        status: 200,
        statusText: '',
        headers: new Headers(),
        text: async () => JSON.stringify({ data: [], has_more: false }),
      });
    getAccessToken
      .mockResolvedValueOnce('test_token')
      .mockResolvedValueOnce('fresh_token');

    const result = await repo.list();

    expect(result).toEqual({ data: [], has_more: false });
    expect(getAccessToken).toHaveBeenNthCalledWith(1);
    expect(getAccessToken).toHaveBeenNthCalledWith(2, { forceRefresh: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1]![1].headers.Authorization).toBe(
      'Bearer fresh_token',
    );
  });

  it('surfaces a 401 that persists after refresh as an API error', async () => {
    mockFetchResponse(401, { error: 'invalid_token' });

    await expect(repo.listAvailableTypes()).rejects.toMatchObject({
      status: 401,
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws when no access token is available', async () => {
    getAccessToken.mockRejectedValueOnce(new Error('Missing access token'));

    await expect(repo.list()).rejects.toThrow('Missing access token');
  });
});
