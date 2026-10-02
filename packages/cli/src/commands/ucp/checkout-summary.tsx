import type { UcpCheckout } from '@stripe/link-sdk';
import { Box, Text } from 'ink';
import type React from 'react';
import { displayAmount } from '../../utils/format-amount';

interface CheckoutSummaryProps {
  checkout: UcpCheckout;
}

/** Shared presentational summary of a UCP checkout session (create + complete). */
export const CheckoutSummary: React.FC<CheckoutSummaryProps> = ({
  checkout,
}) => {
  const totalDetails = checkout.total_details as
    | { amount_fulfillment?: number; formatted_amount_fulfillment?: string }
    | null
    | undefined;
  const total = displayAmount(
    checkout.formatted_amount_total,
    checkout.amount_total,
    checkout.currency,
  );
  const subtotal = displayAmount(
    checkout.formatted_amount_subtotal,
    checkout.amount_subtotal,
    checkout.currency,
  );
  const shipping = displayAmount(
    totalDetails?.formatted_amount_fulfillment,
    totalDetails?.amount_fulfillment,
    checkout.currency,
  );
  const orderStatus = (checkout.order_details as { status?: string })?.status;
  const lineItems = Array.isArray(checkout.line_item_details)
    ? (checkout.line_item_details as Array<{
        sku_id?: string;
        quantity?: number;
        amount_subtotal?: number;
        formatted_amount_subtotal?: string;
      }>)
    : [];

  return (
    <Box flexDirection="column" marginTop={1} paddingX={2}>
      <Text>
        ID:{' '}
        <Text bold color="white">
          {checkout.id}
        </Text>
      </Text>
      {checkout.status && (
        <Text>
          Status:{' '}
          <Text bold color="white">
            {checkout.status}
          </Text>
        </Text>
      )}
      {total && (
        <Text>
          Total:{' '}
          <Text bold color="white">
            {total}
          </Text>
        </Text>
      )}
      {subtotal && (
        <Text>
          Subtotal:{' '}
          <Text bold color="white">
            {subtotal}
          </Text>
        </Text>
      )}
      {shipping && (
        <Text>
          Shipping:{' '}
          <Text bold color="white">
            {shipping}
          </Text>
        </Text>
      )}
      {lineItems.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="white">
            Line Items:
          </Text>
          {lineItems.map((item, index) => {
            const itemAmount = displayAmount(
              item.formatted_amount_subtotal,
              item.amount_subtotal,
              checkout.currency,
            );
            return (
              <Text key={item.sku_id ?? String(index)}>
                {'  '}
                {item.sku_id ?? '—'} ×{item.quantity ?? 1}
                {itemAmount ? `  ${itemAmount}` : ''}
              </Text>
            );
          })}
        </Box>
      )}
      {orderStatus && (
        <Text>
          Order:{' '}
          <Text bold color="white">
            {orderStatus}
          </Text>
        </Text>
      )}
      {checkout.expires_at != null && (
        <Text dimColor>
          Expires: {new Date(checkout.expires_at * 1000).toISOString()}
        </Text>
      )}
    </Box>
  );
};
