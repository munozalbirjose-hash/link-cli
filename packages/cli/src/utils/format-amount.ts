/**
 * Format a minor-unit amount (e.g. cents) into a human-readable major-unit
 * currency string. For example, 5 with currency "usd" becomes "$0.05".
 *
 * Falls back to `${amount} ${currency}` for unknown currency codes.
 */
export function formatAmount(amount: number, currency: string): string {
  const currencyCode = currency.toUpperCase();

  try {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
    });
    const fractionDigits =
      formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(amount / 10 ** fractionDigits);
  } catch {
    return `${amount} ${currency}`;
  }
}

/**
 * Pick the display text for a server-returned amount. Prefers the server's
 * `formatted_*` string; otherwise shows the raw minor-unit amount and currency
 * code (e.g. "1000 JPY") rather than guessing the currency's exponent.
 *
 * Returns undefined when there is no amount to show.
 */
export function displayAmount(
  formatted: string | null | undefined,
  amount: number | null | undefined,
  currency: string | null | undefined,
): string | undefined {
  if (formatted) return formatted;
  if (amount == null) return undefined;
  return `${amount} ${(currency ?? '').toUpperCase()}`.trim();
}
