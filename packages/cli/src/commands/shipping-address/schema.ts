import { z } from 'incur';

export const updateArgs = z.object({
  id: z.string().min(1).describe('Saved shipping address ID'),
});

export const updateOptions = z
  .object({
    name: z
      .string()
      .optional()
      .describe('Full name; an empty string requests clearing'),
    'country-code': z.string().optional().describe('Country code'),
    'line-1': z.string().optional().describe('Address line 1'),
    'line-2': z
      .string()
      .optional()
      .describe('Address line 2; pass an empty string to clear'),
    locality: z.string().optional().describe('City or locality'),
    'administrative-area': z.string().optional().describe('State or region'),
    'postal-code': z.string().optional().describe('Postal code'),
    default: z
      .boolean()
      .optional()
      .describe('Set default status; --no-default clears it'),
  })
  .refine(
    (options) => Object.values(options).some((value) => value !== undefined),
    'Provide at least one address field or default status; omitted fields remain unchanged',
  );
