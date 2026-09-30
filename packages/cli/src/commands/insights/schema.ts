import { z } from 'incur';

const limit = z.coerce
  .number()
  .int()
  .positive()
  .max(100)
  .optional()
  .describe('Maximum number of insights to return (1-100). Defaults to 10.');
const startingAfter = z
  .string()
  .min(1)
  .optional()
  .describe('Cursor: return insights after this insight ID.');

export const listAvailableTypesOptions = z.object({
  limit,
  startingAfter,
});

export const listOptions = z.object({
  insight: z
    .array(z.string().min(1))
    .default([])
    .describe(
      'Only return this insight ID. Repeat to request multiple insights. Omit to return all.',
    ),
  limit,
  startingAfter,
});
