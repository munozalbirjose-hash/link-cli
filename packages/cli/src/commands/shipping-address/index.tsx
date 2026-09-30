import type {
  IShippingAddressResource,
  UpdateShippingAddressParams,
} from '@stripe/link-sdk';
import { Cli } from 'incur';
import type { CliAuthStorage } from '../../auth/storage';
import { renderInteractive } from '../../utils/render-interactive';
import { requireAuth } from '../../utils/require-auth';
import { withAddressScopeGuidance } from './errors';
import { ShippingAddressList } from './list';
import { updateArgs, updateOptions } from './schema';
import {
  ShippingAddressUpdate,
  type ShippingAddressUpdateOutcome,
} from './update';

export function createShippingAddressCli(
  createResource: () => IShippingAddressResource,
  authStorage?: CliAuthStorage,
  envAccessToken?: string,
) {
  const cli = Cli.create('shipping-address', {
    description: 'Shipping address management commands',
  });

  cli.command('list', {
    description: 'List all shipping addresses on your account',
    outputPolicy: 'agent-only' as const,
    middleware: [requireAuth(authStorage, envAccessToken)],
    async run(c) {
      const resource = createResource();

      if (!c.agent && !c.formatExplicit) {
        return renderInteractive(
          <ShippingAddressList resource={resource} onComplete={() => {}} />,
          () => resource.list(),
        );
      }

      return resource.list();
    },
  });

  cli.command('update', {
    description:
      'Update supplied shipping address fields; omitted fields remain unchanged',
    args: updateArgs,
    options: updateOptions,
    outputPolicy: 'agent-only' as const,
    middleware: [requireAuth(authStorage, envAccessToken)],
    async run(c) {
      const options = c.options;
      const address: NonNullable<UpdateShippingAddressParams['address']> = {};
      for (const [flag, field] of [
        ['name', 'name'],
        ['country-code', 'country_code'],
        ['line-1', 'line_1'],
        ['line-2', 'line_2'],
        ['locality', 'locality'],
        ['administrative-area', 'administrative_area'],
        ['postal-code', 'postal_code'],
      ] as const) {
        const value = options[flag];
        if (value !== undefined) address[field] = value;
      }
      const params: UpdateShippingAddressParams = {};
      if (Object.keys(address).length > 0) params.address = address;
      if (options.default !== undefined) params.is_default = options.default;

      // Start once and retain both result and original error across rendering.
      const outcome: Promise<ShippingAddressUpdateOutcome> = createResource()
        .update(c.args.id, params)
        .then(
          (record) => ({ record }),
          (error: unknown) => ({
            error: withAddressScopeGuidance(error, envAccessToken),
          }),
        );
      if (!c.agent && !c.formatExplicit) {
        await renderInteractive(<ShippingAddressUpdate outcome={outcome} />);
      }
      const result = await outcome;
      if ('error' in result) throw result.error;
      return result.record;
    },
  });

  return cli;
}
