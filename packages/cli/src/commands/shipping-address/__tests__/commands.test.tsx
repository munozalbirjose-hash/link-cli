import type { IShippingAddressResource } from '@stripe/link-sdk';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderInteractive } from '../../../utils/render-interactive';
import { createShippingAddressCli } from '..';
import type { ShippingAddressUpdateOutcome } from '../update';

vi.mock('../../../utils/render-interactive', () => ({
  renderInteractive: vi.fn(
    async (
      element: ReactElement<{ outcome: Promise<ShippingAddressUpdateOutcome> }>,
    ) => {
      await element.props.outcome;
    },
  ),
}));

afterEach(() => vi.clearAllMocks());

describe('interactive shipping address update command', () => {
  it.each([false, true])(
    'performs one mutation and propagates failure=%s',
    async (fail) => {
      const update = fail
        ? vi.fn().mockRejectedValue(new Error('Original update failure'))
        : vi.fn().mockResolvedValue({
            id: 'addr_1',
            is_default: false,
            nickname: null,
            address: null,
          });
      const resource: IShippingAddressResource = { list: vi.fn(), update };
      const cli = createShippingAddressCli(
        () => resource,
        undefined,
        'test-token',
      );
      const descriptor = Object.getOwnPropertyDescriptor(
        process.stdout,
        'isTTY',
      );
      let output = '';
      const exit = vi.fn();
      try {
        Object.defineProperty(process.stdout, 'isTTY', {
          configurable: true,
          value: true,
        });
        await cli.serve(['update', 'addr_1', '--line-2', ''], {
          stdout: (text) => {
            output += text;
          },
          exit,
        });
      } finally {
        if (descriptor)
          Object.defineProperty(process.stdout, 'isTTY', descriptor);
        else Reflect.deleteProperty(process.stdout, 'isTTY');
      }
      expect(renderInteractive).toHaveBeenCalledOnce();
      expect(update).toHaveBeenCalledExactlyOnceWith('addr_1', {
        address: { line_2: '' },
      });
      expect(resource.list).not.toHaveBeenCalled();
      if (fail) {
        expect(exit).toHaveBeenCalledWith(1);
        expect(output).toContain('Original update failure');
      } else {
        expect(exit).not.toHaveBeenCalledWith(1);
      }
    },
  );
});
