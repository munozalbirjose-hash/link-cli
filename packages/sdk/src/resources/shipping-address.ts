import { z } from 'zod';
import type { LinkOptions } from '@/config';
import { LinkSdkError } from '@/errors';
import { BaseResource } from '@/resources/base';
import type { IShippingAddressResource } from '@/resources/interfaces';
import type {
  ShippingAddressRecord,
  UpdateShippingAddressParams,
} from '@/types/index';

const shippingAddressSchema = z.looseObject({
  id: z.string(),
  is_default: z.boolean(),
  nickname: z.optional(z.string().nullable()),
  address: z
    .looseObject({
      name: z.string().nullable().optional(),
      country_code: z.string().nullable().optional(),
      line_1: z.string().nullable().optional(),
      line_2: z.string().nullable().optional(),
      locality: z.string().nullable().optional(),
      dependent_locality: z.string().nullable().optional(),
      administrative_area: z.string().nullable().optional(),
      postal_code: z.string().nullable().optional(),
      sorting_code: z.string().nullable().optional(),
    })
    .nullable(),
});
const updateShippingAddressSchema = z
  .object({
    address: z
      .object({
        name: z.string().optional(),
        country_code: z.string().optional(),
        line_1: z.string().optional(),
        line_2: z.string().optional(),
        locality: z.string().optional(),
        administrative_area: z.string().optional(),
        postal_code: z.string().optional(),
      })
      .optional(),
    is_default: z.boolean().optional(),
  })
  .refine(
    (params) =>
      params.is_default !== undefined ||
      Object.values(params.address ?? {}).some((value) => value !== undefined),
    'Provide at least one address field or default status',
  );
const shippingAddressesResponseSchema = z.looseObject({
  shipping_addresses: z.array(shippingAddressSchema),
});

export class ShippingAddressResource
  extends BaseResource
  implements IShippingAddressResource
{
  constructor(options: LinkOptions) {
    super(options, '/shipping_addresses');
  }

  /** Update only supplied fields; send an empty string to clear a field. */
  async update(
    id: string,
    params: UpdateShippingAddressParams,
  ): Promise<ShippingAddressRecord> {
    const parsed = updateShippingAddressSchema.safeParse(params);
    if (!parsed.success) {
      throw new LinkSdkError(z.prettifyError(parsed.error), {
        code: 'invalid_input',
      });
    }
    const body = parsed.data;
    if (
      !Object.values(body.address ?? {}).some((value) => value !== undefined)
    ) {
      delete body.address;
    }
    const { status, data, rawBody } = await this.apiFetch({
      method: 'POST',
      url: `${this.endpoint}/${encodeURIComponent(id)}`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (status < 200 || status >= 300) {
      this.throwApiError('update shipping address', status, data, rawBody);
    }
    return this.parseResponse(
      'update shipping address',
      status,
      () => shippingAddressSchema.parse(data) as ShippingAddressRecord,
    );
  }

  async list(): Promise<ShippingAddressRecord[]> {
    const { status, data, rawBody } = await this.apiFetch({
      method: 'GET',
      url: this.endpoint,
    });

    if (status < 200 || status >= 300) {
      this.throwApiError('list shipping addresses', status, data, rawBody);
    }

    return this.parseResponse(
      'list shipping addresses',
      status,
      () =>
        shippingAddressesResponseSchema.parse(data)
          .shipping_addresses as ShippingAddressRecord[],
    );
  }
}
