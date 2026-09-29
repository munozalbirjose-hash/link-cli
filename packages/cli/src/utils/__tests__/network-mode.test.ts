import { describe, expect, it } from 'vitest';
import { getNetworkModeError } from '../network-mode';

describe('getNetworkModeError', () => {
  it.each([
    ['profile_test_123', true],
    ['profile_123', false],
    ['net_opaque', true],
    ['net_opaque', false],
  ])('accepts network ID %s with test=%s', (networkId, test) => {
    expect(getNetworkModeError(networkId, test)).toBeUndefined();
  });

  it('requires --test for a test network ID', () => {
    expect(getNetworkModeError('profile_test_123', false)).toBe(
      'Network ID profile_test_123 is test mode. Re-run with --test.',
    );
  });

  it('rejects --test for a live network ID', () => {
    expect(getNetworkModeError('profile_123', true)).toBe(
      'Network ID profile_123 is live mode. Remove --test.',
    );
  });
});
