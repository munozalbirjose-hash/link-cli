import type {
  IInsightsResource,
  ListAvailableInsightTypesParams,
  ListInsightsParams,
} from '@stripe/link-sdk';
import { Cli } from 'incur';
import type { CliAuthStorage } from '../../auth/storage';
import { renderInteractive } from '../../utils/render-interactive';
import { requireAuth } from '../../utils/require-auth';
import { InsightsList } from './list';
import { AvailableInsightTypesList } from './list-available-types';
import { listAvailableTypesOptions, listOptions } from './schema';

export function createInsightsCli(
  createResource: () => IInsightsResource,
  authStorage?: CliAuthStorage,
  envAccessToken?: string,
) {
  const cli = Cli.create('insights', {
    description: '[beta] List precomputed insights about your Link activity',
  });

  cli.command('list-available-types', {
    description:
      'List insight types and any additional authorization each one needs',
    options: listAvailableTypesOptions,
    outputPolicy: 'agent-only' as const,
    middleware: [requireAuth(authStorage, envAccessToken)],
    async run(c) {
      const opts = c.options;
      const resource = createResource();

      const params: ListAvailableInsightTypesParams = {};
      if (opts.limit !== undefined) params.limit = opts.limit;
      if (opts.startingAfter !== undefined)
        params.starting_after = opts.startingAfter;

      if (!c.agent && !c.formatExplicit) {
        return renderInteractive(
          <AvailableInsightTypesList
            resource={resource}
            params={params}
            onComplete={() => {}}
          />,
          () => resource.listAvailableTypes(params),
        );
      }

      return resource.listAvailableTypes(params);
    },
  });

  cli.command('list', {
    description:
      'List computed insight results, including status and missing access',
    options: listOptions,
    outputPolicy: 'agent-only' as const,
    middleware: [requireAuth(authStorage, envAccessToken)],
    async run(c) {
      const opts = c.options;
      const resource = createResource();

      const params: ListInsightsParams = {};
      if (opts.insight.length > 0) params.insights = opts.insight;
      if (opts.limit !== undefined) params.limit = opts.limit;
      if (opts.startingAfter !== undefined)
        params.starting_after = opts.startingAfter;

      if (!c.agent && !c.formatExplicit) {
        return renderInteractive(
          <InsightsList
            resource={resource}
            params={params}
            onComplete={() => {}}
          />,
          () => resource.list(params),
        );
      }

      return resource.list(params);
    },
  });

  return cli;
}
