import { describe, expect, it } from 'vitest';
import { displayAmount, formatAmount } from '../format-amount';

describe('formatAmount', () => {
  it.each([
    [1234, 'usd', '$12.34'],
    [1234, 'eur', '€12.34'],
    [1000, 'jpy', '¥1,000'],
    [5000, 'krw', '₩5,000'],
    [1000, 'kwd', 'KWD 1.000'],
  ])('formats %d %s as %s', (amount, currency, expected) => {
    expect(formatAmount(amount, currency)).toBe(expected);
  });

  it('accepts uppercase currency codes', () => {
    expect(formatAmount(1234, 'USD')).toBe('$12.34');
  });

  it('falls back to the raw amount for unknown currency codes', () => {
    expect(formatAmount(1234, 'zz')).toBe('1234 zz');
  });
});

describe('displayAmount', () => {
  it('prefers the server-formatted string', () => {
    expect(displayAmount('¥1,000', 1000, 'jpy')).toBe('¥1,000');
  });

  it('falls back to the raw minor-unit amount and currency code', () => {
    expect(displayAmount(undefined, 1000, 'jpy')).toBe('1000 JPY');
    expect(displayAmount(null, 0, 'usd')).toBe('0 USD');
    expect(displayAmount('', 500, null)).toBe('500');
  });

  it('returns undefined when there is no amount', () => {
    expect(displayAmount(undefined, undefined, 'usd')).toBeUndefined();
    expect(displayAmount(null, null, null)).toBeUndefined();
  });
});
