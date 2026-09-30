import type {
  AvailableInsightTypesPage,
  IInsightsResource,
  InsightsPage,
} from '@stripe/link-sdk';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import { sanitizeResource } from '../../../utils/resource-factory';
import { InsightsList } from '../list';
import { AvailableInsightTypesList } from '../list-available-types';

const ESCAPE_PAYLOAD = '\x1b[2JEvil\rHidden';
const CLEAN_TEXT = 'EvilHidden';
const TOP_BRAND = 'top_brand_by_transaction_count_per_category_t180d';
const TOP_BRAND_DESCRIPTION =
  'Top brands from shopping categories in the last 180 days based on transaction count';
const REMEDIATION = {
  authorization_details: [
    {
      type: 'source',
      actions: ['read_link_transactions', 'read_external_transactions'],
      source_ids: ['csmrpd_secret_source'],
    },
  ],
};

function makeResource(pages: {
  types?: AvailableInsightTypesPage;
  insights?: InsightsPage;
  error?: Error;
}): IInsightsResource {
  return sanitizeResource({
    listAvailableTypes: vi.fn(async () => {
      if (pages.error) throw pages.error;
      return pages.types ?? { data: [], has_more: false };
    }),
    list: vi.fn(async () => {
      if (pages.error) throw pages.error;
      return pages.insights ?? { data: [], has_more: false };
    }),
  } as unknown as IInsightsResource);
}

describe('insights list-available-types component', () => {
  it('renders types, remediation, and the next-page cursor', async () => {
    const resource = makeResource({
      types: {
        data: [
          { id: 'available_insight', description: 'No extra access needed' },
          {
            id: TOP_BRAND,
            description: TOP_BRAND_DESCRIPTION,
            authorization_remediation: REMEDIATION,
          },
        ],
        has_more: true,
      },
    });

    const { lastFrame } = render(
      <AvailableInsightTypesList resource={resource} onComplete={() => {}} />,
    );

    await vi.waitFor(() => {
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Available insight types');
      expect(frame).toContain('available_insight');
      expect(frame).toContain(TOP_BRAND);
      expect(frame).toContain('Needs additional access:');
      expect(frame).toContain(
        'source actions: read_link_transactions, read_external_transactions',
      );
      expect(frame).not.toContain('csmrpd_secret_source');
      expect(frame).toContain(`next page: --starting-after ${TOP_BRAND}`);
    });
  });

  it('renders an empty state', async () => {
    const resource = makeResource({});

    const { lastFrame } = render(
      <AvailableInsightTypesList resource={resource} onComplete={() => {}} />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain('No insight types available');
    });
  });

  it('renders API errors', async () => {
    const resource = makeResource({
      error: new Error('Failed to list available insight types (500): boom'),
    });

    const { lastFrame } = render(
      <AvailableInsightTypesList resource={resource} onComplete={() => {}} />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain('Failed to load insight types');
      expect(lastFrame()).toContain('(500): boom');
    });
  });

  it('sanitizes escape sequences in type fields', async () => {
    const resource = makeResource({
      types: {
        data: [{ id: TOP_BRAND, description: ESCAPE_PAYLOAD }],
        has_more: false,
      },
    });

    const { lastFrame } = render(
      <AvailableInsightTypesList resource={resource} onComplete={() => {}} />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain(CLEAN_TEXT);
      expect(lastFrame()).not.toContain('\x1b[2J');
    });
  });
});

describe('insights list component', () => {
  it('renders a ready result with counts and as_of', async () => {
    const resource = makeResource({
      insights: {
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
                  number_of_items: { label: 'Nordstrom', count: 1 },
                },
              },
              {
                label: 'Unlabeled count',
                value: {
                  type: 'number_of_items',
                  number_of_items: { count: 3 },
                },
              },
            ],
          },
        ],
        has_more: false,
      },
    });

    const { lastFrame } = render(
      <InsightsList resource={resource} onComplete={() => {}} />,
    );

    await vi.waitFor(() => {
      const frame = lastFrame() ?? '';
      expect(frame).toContain(TOP_BRAND);
      expect(frame).toContain('status: ready');
      expect(frame).toContain('as of 2026-09-29 23:16 UTC');
      expect(frame).toContain(
        'Top brand from Clothing and accessories shopping category: J.crew (10 items)',
      );
      expect(frame).toContain(
        'Department stores shopping category: Nordstrom (1 item)',
      );
      expect(frame).toContain('Unlabeled count: 3 items');
      expect(frame).toContain('has_more: false');
      expect(frame).not.toContain('next page');
    });
  });

  it('distinguishes pending, missing permissions, internal errors, and no data', async () => {
    const resource = makeResource({
      insights: {
        data: [
          { status: 'pending', id: 'pending_insight', description: 'Pending' },
          {
            status: 'no_data',
            as_of: 1790723779,
            id: TOP_BRAND,
            description: TOP_BRAND_DESCRIPTION,
            error_code: 'missing_permissions',
            error_message: 'Transaction access is required.',
            authorization_remediation: REMEDIATION,
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
        has_more: true,
      },
    });

    const { lastFrame } = render(
      <InsightsList resource={resource} onComplete={() => {}} />,
    );

    await vi.waitFor(() => {
      const frame = lastFrame() ?? '';
      expect(frame).toContain('status: pending: not computed yet');
      expect(frame).toContain('status: no data: missing permissions');
      expect(frame).toContain('Transaction access is required.');
      expect(frame).toContain(
        'source actions: read_link_transactions, read_external_transactions',
      );
      expect(frame).not.toContain('csmrpd_secret_source');
      expect(frame).toContain('status: no data: internal error');
      expect(frame).toContain('Could not compute this insight.');
      expect(frame).toContain('status: no data available');
      expect(frame).toContain('next page: --starting-after empty_insight');
    });
  });

  it('degrades safely for unknown statuses and value types', async () => {
    const resource = makeResource({
      insights: {
        data: [
          {
            status: 'stale',
            id: 'future_insight',
            description: 'Future',
            data: [
              {
                label: 'Monthly volume',
                value: {
                  type: 'payment_volume',
                  payment_volume: { amount: 1234, currency: 'usd' },
                },
              },
            ],
          },
        ],
        has_more: false,
      },
    });

    const { lastFrame } = render(
      <InsightsList resource={resource} onComplete={() => {}} />,
    );

    await vi.waitFor(() => {
      const frame = lastFrame() ?? '';
      expect(frame).toContain('status: stale');
      expect(frame).toContain(
        'Monthly volume: payment_volume value (use --format json to view)',
      );
    });
  });

  it('renders an empty state', async () => {
    const resource = makeResource({});

    const { lastFrame } = render(
      <InsightsList resource={resource} onComplete={() => {}} />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain('No insights found');
    });
  });

  it('sanitizes escape sequences in labels and error messages', async () => {
    const resource = makeResource({
      insights: {
        data: [
          {
            status: 'no_data',
            id: TOP_BRAND,
            description: TOP_BRAND_DESCRIPTION,
            error_code: 'internal_error',
            error_message: ESCAPE_PAYLOAD,
            data: [
              {
                label: ESCAPE_PAYLOAD,
                value: {
                  type: 'number_of_items',
                  number_of_items: { label: ESCAPE_PAYLOAD, count: 2 },
                },
              },
            ],
          },
        ],
        has_more: false,
      },
    });

    const { lastFrame } = render(
      <InsightsList resource={resource} onComplete={() => {}} />,
    );

    await vi.waitFor(() => {
      const frame = lastFrame() ?? '';
      expect(frame).toContain(`${CLEAN_TEXT}: ${CLEAN_TEXT} (2 items)`);
      expect(frame).not.toContain('\x1b[2J');
      expect(frame).not.toContain('\r');
    });
  });
});
