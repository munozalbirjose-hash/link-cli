import { LinkApiError, type ShippingAddressRecord } from '@stripe/link-sdk';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import { withAddressScopeGuidance } from '../errors';
import { ShippingAddressUpdate } from '../update';

describe('shipping address update', () => {
  it('renders the returned address and default status', async () => {
    const record: ShippingAddressRecord = {
      id: 'addr_1',
      is_default: false,
      nickname: null,
      address: {
        name: 'Jane Doe',
        country_code: 'US',
        line_1: '123 Main St',
        line_2: '',
        locality: 'Boston',
        administrative_area: 'MA',
        postal_code: '02110',
        dependent_locality: null,
        sorting_code: null,
      },
    };
    const { lastFrame, unmount } = render(
      <ShippingAddressUpdate outcome={Promise.resolve({ record })} />,
    );
    await vi.waitFor(() => {
      expect(lastFrame()).toContain('Updated shipping address addr_1');
      expect(lastFrame()).toContain('Jane Doe');
      expect(lastFrame()).toContain('Boston, MA');
      expect(lastFrame()).toContain('Default: no');
    });
    unmount();
  });

  it('renders a sanitized failure', async () => {
    const { lastFrame, unmount } = render(
      <ShippingAddressUpdate
        outcome={Promise.resolve({ error: new Error('\x1b[2JUnavailable\r') })}
      />,
    );
    await vi.waitFor(() => {
      expect(lastFrame()).toContain('Failed to update shipping address');
      expect(lastFrame()).toContain('Unavailable');
      expect(lastFrame()).not.toContain('\x1b[2J');
    });
    unmount();
  });

  it.each([401, 403])(
    'preserves the API error and adds guidance on %s',
    (status) => {
      const details = {
        error: {
          message:
            'Access token is missing required scopes: read_phone, write_address',
        },
      };
      const error = new LinkApiError('original error', {
        status,
        details,
        rawBody: JSON.stringify(details),
      });
      expect(withAddressScopeGuidance(error)).toBe(error);
      expect(error.details).toBe(details);
      expect(error.rawBody).toBe(JSON.stringify(details));
      expect(error.message).toContain('original error');
      expect(error.message).toContain('auth upgrade --scope write_address');
    },
  );

  it.each([
    [403, 'Forbidden'],
    [401, 'Access token is missing required scopes: read_phone'],
    [500, 'Access token is missing required scopes: write_address'],
  ])('does not reinterpret %s: %s', (status, message) => {
    const error = new LinkApiError(message, {
      status,
      details: { error: { message } },
    });
    expect(withAddressScopeGuidance(error)).toBe(error);
    expect(error.message).toBe(message);
  });

  it('explains environment token precedence', () => {
    const error = new LinkApiError('original', {
      status: 403,
      details: {
        error: {
          message: 'Access token is missing required scopes: write_address',
        },
      },
    });
    withAddressScopeGuidance(error, 'secret');
    expect(error.message).toContain('Replace or unset LINK_ACCESS_TOKEN');
    expect(error.message).not.toContain('secret');
  });
});
