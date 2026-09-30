import type {
  IInsightsResource,
  InsightsPage,
  ListInsightsParams,
} from '@stripe/link-sdk';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type React from 'react';
import { useCallback } from 'react';
import { useAsyncAction } from '../../hooks/use-async-action';
import {
  describeInsightStatus,
  formatAsOf,
  formatInsightValue,
  formatRemediation,
} from './format';

interface InsightsListProps {
  resource: IInsightsResource;
  params?: ListInsightsParams;
  onComplete: (result: InsightsPage | null) => void;
}

export const InsightsList: React.FC<InsightsListProps> = ({
  resource,
  params,
  onComplete,
}) => {
  const action = useCallback(() => resource.list(params), [resource, params]);
  const { status, data: page, error } = useAsyncAction(action, onComplete);
  const insights = page?.data ?? [];
  const nextCursor =
    page?.has_more && insights.length > 0
      ? insights[insights.length - 1].id
      : null;

  if (status === 'loading') {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" /> Loading insights...
        </Text>
      </Box>
    );
  }

  if (status === 'error') {
    return (
      <Box flexDirection="column">
        <Text color="red">Failed to load insights</Text>
        <Text color="red">{error}</Text>
      </Box>
    );
  }

  if (insights.length === 0) {
    return (
      <Box>
        <Text dimColor>No insights found</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>Insights</Text>
      {insights.map((insight) => {
        const insightStatus = describeInsightStatus(insight);
        const asOf = formatAsOf(insight.as_of);
        const entries = insight.data ?? [];
        const remediation = formatRemediation(
          insight.authorization_remediation,
        );
        return (
          <Box
            key={insight.id}
            flexDirection="column"
            marginTop={1}
            paddingX={2}
          >
            <Text bold>{insight.id}</Text>
            <Text>{insight.description}</Text>
            <Text color={insightStatus.tone}>
              {`status: ${insightStatus.label}`}
              {asOf ? <Text dimColor>{` (as of ${asOf})`}</Text> : null}
            </Text>
            {insight.error_message ? (
              <Text>{insight.error_message}</Text>
            ) : null}
            {remediation.length > 0 ? (
              <Box flexDirection="column">
                <Text color="yellow">Needs additional access:</Text>
                {remediation.map((line) => (
                  <Text key={line} color="yellow">
                    {`  ${line}`}
                  </Text>
                ))}
              </Box>
            ) : null}
            {entries.map((entry, index) => (
              <Text
                // Labels are not guaranteed unique.
                // biome-ignore lint/suspicious/noArrayIndexKey: display-only list
                key={index}
              >
                {`  • ${entry.label}: ${formatInsightValue(entry.value)}`}
              </Text>
            ))}
          </Box>
        );
      })}
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>has_more: {String(page?.has_more ?? false)}</Text>
        {nextCursor ? (
          <Text dimColor>{`next page: --starting-after ${nextCursor}`}</Text>
        ) : null}
      </Box>
    </Box>
  );
};
