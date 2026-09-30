import { z } from 'zod';
import type { LinkOptions } from '@/config';
import { BaseResource } from '@/resources/base';
import type {
  IInsightsResource,
  ListAvailableInsightTypesParams,
  ListInsightsParams,
} from '@/resources/interfaces';
import type { AvailableInsightTypesPage, InsightsPage } from '@/types/index';

const authorizationDetailSchema = z.looseObject({
  type: z.string(),
  actions: z.array(z.string()).optional(),
});
const authorizationRemediationSchema = z.looseObject({
  scope: z.array(z.string()).optional(),
  authorization_details: z.array(authorizationDetailSchema).optional(),
});

const NUMBER_OF_ITEMS = 'number_of_items';
// Known value types are validated; any other tagged value is preserved as-is
// so new server value types do not break older clients.
const insightValueSchema = z.union([
  z.looseObject({
    type: z.literal(NUMBER_OF_ITEMS),
    number_of_items: z.looseObject({
      label: z.string().nullish(),
      count: z.number().int(),
    }),
  }),
  z.looseObject({
    type: z.string().refine((type) => type !== NUMBER_OF_ITEMS),
  }),
]);
const insightEntrySchema = z.looseObject({
  label: z.string(),
  value: insightValueSchema,
});

const availableInsightTypeSchema = z.looseObject({
  id: z.string(),
  description: z.string(),
  authorization_remediation: authorizationRemediationSchema.nullish(),
});
const availableInsightTypesPageSchema = z.looseObject({
  data: z.array(availableInsightTypeSchema),
  has_more: z.boolean(),
});

const insightSchema = z.looseObject({
  status: z.string(),
  id: z.string(),
  description: z.string(),
  error_code: z.string().nullish(),
  error_message: z.string().nullish(),
  authorization_remediation: authorizationRemediationSchema.nullish(),
  as_of: z.number().nullish(),
  data: z.array(insightEntrySchema).nullish(),
});
const insightsPageSchema = z.looseObject({
  data: z.array(insightSchema),
  has_more: z.boolean(),
});

export class InsightsResource
  extends BaseResource
  implements IInsightsResource
{
  constructor(options: LinkOptions) {
    super(options, '/insights');
  }

  private buildUrl(
    path: string,
    params: { limit?: number; starting_after?: string; insights?: string[] },
  ): string {
    const url = new URL(`${this.endpoint}${path}`);

    if (params.limit !== undefined) {
      url.searchParams.set('limit', String(params.limit));
    }
    if (params.starting_after !== undefined) {
      url.searchParams.set('starting_after', params.starting_after);
    }
    if (params.insights !== undefined) {
      for (const insight of params.insights) {
        url.searchParams.append('insights[]', insight);
      }
    }

    return url.toString();
  }

  async listAvailableTypes(
    params: ListAvailableInsightTypesParams = {},
  ): Promise<AvailableInsightTypesPage> {
    const { status, data, rawBody } = await this.apiFetch({
      method: 'GET',
      url: this.buildUrl('/available_types', params),
    });

    if (status < 200 || status >= 300) {
      this.throwApiError('list available insight types', status, data, rawBody);
    }

    return this.parseResponse(
      'list available insight types',
      status,
      () =>
        availableInsightTypesPageSchema.parse(
          data,
        ) as AvailableInsightTypesPage,
    );
  }

  async list(params: ListInsightsParams = {}): Promise<InsightsPage> {
    const { status, data, rawBody } = await this.apiFetch({
      method: 'GET',
      url: this.buildUrl('', params),
    });

    if (status < 200 || status >= 300) {
      this.throwApiError('list insights', status, data, rawBody);
    }

    return this.parseResponse(
      'list insights',
      status,
      () => insightsPageSchema.parse(data) as InsightsPage,
    );
  }
}
