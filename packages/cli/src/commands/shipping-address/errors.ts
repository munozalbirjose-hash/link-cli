import { LinkApiError } from '@stripe/link-sdk';
import { z } from 'incur';

const scopeErrorSchema = z.object({
  error: z.object({ message: z.string() }),
});
const MISSING_SCOPES_PREFIX = 'Access token is missing required scopes: ';

/** Keep the original API error, adding guidance only for missing write_address. */
export function withAddressScopeGuidance(
  error: unknown,
  envAccessToken?: string,
): unknown {
  if (!(error instanceof LinkApiError) || ![401, 403].includes(error.status))
    return error;
  const parsed = scopeErrorSchema.safeParse(error.details);
  if (!parsed.success) return error;
  const message = parsed.data.error.message;
  if (
    !message.startsWith(MISSING_SCOPES_PREFIX) ||
    !message
      .slice(MISSING_SCOPES_PREFIX.length)
      .split(',')
      .map((scope) => scope.trim())
      .includes('write_address')
  ) {
    return error;
  }
  error.message +=
    ' Run "link-cli auth upgrade --scope write_address" to grant address updates while retaining your current access.';
  if (envAccessToken) {
    error.message +=
      ' Replace or unset LINK_ACCESS_TOKEN before retrying; it overrides the upgraded stored session.';
  }
  return error;
}
