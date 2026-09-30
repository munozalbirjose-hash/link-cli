import type { ShippingAddressRecord } from '@stripe/link-sdk';
import { Box, Text, useApp } from 'ink';
import Spinner from 'ink-spinner';
import { useCallback } from 'react';
import { useAsyncAction } from '../../hooks/use-async-action';
import { sanitizeText } from '../../utils/sanitize-text';

export type ShippingAddressUpdateOutcome =
  | { record: ShippingAddressRecord }
  | { error: unknown };

export function ShippingAddressUpdate({
  outcome,
}: {
  outcome: Promise<ShippingAddressUpdateOutcome>;
}) {
  const { exit } = useApp();
  const action = useCallback(() => outcome, [outcome]);
  const { data } = useAsyncAction(action, () => exit());
  if (!data) {
    return (
      <Text color="cyan">
        <Spinner type="dots" /> Updating shipping address...
      </Text>
    );
  }
  if ('error' in data) {
    const message =
      data.error instanceof Error ? data.error.message : String(data.error);
    return (
      <Box flexDirection="column">
        <Text color="red">Failed to update shipping address</Text>
        <Text color="red">{sanitizeText(message)}</Text>
      </Box>
    );
  }
  const { record } = data;
  const address = record.address;
  const lines = address
    ? [
        address.name,
        address.line_1,
        address.line_2,
        [
          address.dependent_locality,
          address.locality,
          address.administrative_area,
        ]
          .filter(Boolean)
          .join(', '),
        [address.postal_code, address.sorting_code].filter(Boolean).join(' '),
        address.country_code,
      ].filter((line): line is string => Boolean(line))
    : ['Address details unavailable'];
  return (
    <Box flexDirection="column">
      <Text color="green">
        Updated shipping address {sanitizeText(record.id)}.
      </Text>
      <Text>Default: {record.is_default ? 'yes' : 'no'}</Text>
      <Text>{lines.map(sanitizeText).join('\n')}</Text>
    </Box>
  );
}
