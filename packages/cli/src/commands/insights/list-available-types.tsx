import type {
  AvailableInsightTypesPage,
  IInsightsResource,
  ListAvailableInsightTypesParams,
} from '@stripe/link-sdk';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type React from 'react';
import { useCallback } from 'react';
import { useAsyncAction } from '../../hooks/use-async-action';
import { formatRemediation } from './format';

interface AvailableInsightTypesListProps {
  resource: IInsightsResource;
  params?: ListAvailableInsightTypesParams;
  onComplete: (result: AvailableInsightTypesPage | null) => void;
}

export const AvailableInsightTypesList: React.FC<
  AvailableInsightTypesListProps
> = ({ resource, params, onComplete }) => {
  const action = useCallback(
    () => resource.listAvailableTypes(params),
    [resource, params],
  );
  const { status, data: page, error } = useAsyncAction(action, onComplete);
  const types = page?.data ?? [];
  const nextCursor =
    page?.has_more && types.length > 0 ? types[types.length - 1].id : null;

  if (status === 'loading') {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" /> Loading insight types...
        </Text>
      </Box>
    );
  }

  if (status === 'error') {
    return (
      <Box flexDirection="column">
        <Text color="red">Failed to load insight types</Text>
        <Text color="red">{error}</Text>
      </Box>
    );
  }

  if (types.length === 0) {
    return (
      <Box>
        <Text dimColor>No insight types available</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>Available insight types</Text>
      {types.map((type) => {
        const remediation = formatRemediation(type.authorization_remediation);
        return (
          <Box key={type.id} flexDirection="column" marginTop={1} paddingX={2}>
            <Text bold>{type.id}</Text>
            <Text>{type.description}</Text>
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
