import type {
  AuthorizationRemediation,
  Insight,
  InsightValue,
} from '@stripe/link-sdk';

/**
 * Summarizes the access a remediation asks for. Only scope names, detail types,
 * and actions are shown; other detail fields (for example source identifiers)
 * stay in structured output.
 */
export function formatRemediation(
  remediation: AuthorizationRemediation | null | undefined,
): string[] {
  if (!remediation) {
    return [];
  }

  const lines: string[] = [];
  if (remediation.scope && remediation.scope.length > 0) {
    lines.push(`scope: ${remediation.scope.join(', ')}`);
  }
  for (const detail of remediation.authorization_details ?? []) {
    const actions = Array.isArray(detail.actions)
      ? detail.actions.filter((action) => typeof action === 'string')
      : [];
    lines.push(
      actions.length > 0
        ? `${detail.type} actions: ${actions.join(', ')}`
        : detail.type,
    );
  }
  return lines;
}

export function formatInsightValue(value: InsightValue): string {
  if (value.type === 'number_of_items') {
    const { label, count } = value.number_of_items as {
      label?: string | null;
      count: number;
    };
    const items = `${count} ${count === 1 ? 'item' : 'items'}`;
    return label ? `${label} (${items})` : items;
  }
  return `${value.type} value (use --format json to view)`;
}

export function formatAsOf(asOf: number | null | undefined): string | null {
  if (typeof asOf !== 'number' || !Number.isFinite(asOf)) {
    return null;
  }
  const date = new Date(asOf * 1000);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export type InsightStatusTone = 'green' | 'yellow' | 'red' | 'gray';

export function describeInsightStatus(insight: Insight): {
  label: string;
  tone: InsightStatusTone;
} {
  if (insight.status === 'ready') {
    return { label: 'ready', tone: 'green' };
  }
  if (insight.status === 'pending') {
    return { label: 'pending: not computed yet', tone: 'yellow' };
  }
  if (insight.error_code === 'missing_permissions') {
    return { label: 'no data: missing permissions', tone: 'red' };
  }
  if (insight.error_code === 'internal_error') {
    return { label: 'no data: internal error', tone: 'red' };
  }
  if (insight.status === 'no_data') {
    return {
      label: insight.error_code
        ? `no data: ${insight.error_code}`
        : 'no data available',
      tone: 'gray',
    };
  }
  return { label: insight.status, tone: 'gray' };
}
