// Only these literal names can leave the process. Paths are matched locally;
// neither an unmatched path nor a captured ID is ever returned.
const routes = [
  ['GET', /^\/payment-details$/, 'payment_methods.list'],
  ['GET', /^\/payment-details\/[^/]+$/, 'payment_methods.retrieve'],
  ['POST', /^\/payment-details\/[^/]+$/, 'payment_methods.update'],
  ['GET', /^\/spend_requests$/, 'spend_requests.list'],
  [
    'POST',
    /^\/spend_requests(?:\/create_delegated)?$/,
    'spend_requests.create',
  ],
  ['GET', /^\/spend_requests\/[^/]+$/, 'spend_requests.retrieve'],
  [
    'POST',
    /^\/spend_requests\/[^/]+(?:\/update_delegated)?$/,
    'spend_requests.update',
  ],
  ['POST', /^\/spend_requests\/[^/]+\/cancel$/, 'spend_requests.cancel'],
  [
    'POST',
    /^\/spend_requests\/[^/]+\/request_approval$/,
    'spend_requests.request_approval',
  ],
  ['GET', /^\/shipping_addresses$/, 'shipping_addresses.list'],
  ['GET', /^\/userinfo$/, 'user_info.retrieve'],
  ['GET', /^\/approval-policy$/, 'approval_policy.retrieve'],
  ['GET', /^\/transactions$/, 'transactions.list'],
  ['GET', /^\/sources$/, 'sources.list'],
  ['GET', /^\/balances$/, 'balances.list'],
  ['POST', /^\/agent_observations$/, 'reports.create'],
  ['POST', /^\/web_bot_auth\/sign$/, 'web_bot_auth.sign'],
  ['GET', /^\/ucp\/catalog\/search$/, 'ucp.search'],
  ['POST', /^\/ucp\/checkout$/, 'ucp.create'],
  ['GET', /^\/ucp\/checkout\/[^/]+$/, 'ucp.retrieve'],
  ['POST', /^\/ucp\/checkout\/[^/]+\/complete$/, 'ucp.complete'],
  ['GET', /^\/\.well-known\/aap-issuer$/, 'identity.discover'],
  ['POST', /^\/device\/code$/, 'auth.initiate'],
  // Polling and refresh use the same route. Do not inspect credential bodies.
  ['POST', /^\/device\/token$/, 'auth.token'],
  ['POST', /^\/device\/revoke$/, 'auth.revoke'],
] as const;

export type Operation = (typeof routes)[number][2] | 'unknown';
export const operations: ReadonlySet<string> = new Set([
  ...routes.map((route) => route[2]),
  'unknown',
]);

export const httpMethods = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'CONNECT',
  'TRACE',
  'unknown',
] as const;
export type HttpMethod = (typeof httpMethods)[number];

export function createRequestClassifier(baseUrls: readonly string[]) {
  const bases = baseUrls
    .flatMap((base) => {
      try {
        const url = new URL(base);
        if (!['http:', 'https:'].includes(url.protocol)) return [];
        return [{ origin: url.origin, path: url.pathname.replace(/\/+$/, '') }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.path.length - a.path.length);

  return (
    input: RequestInfo | URL,
    init?: RequestInit,
  ):
    | {
        operation: Operation;
        httpMethod: HttpMethod;
      }
    | undefined => {
    try {
      const request = input instanceof Request ? input : undefined;
      const url = new URL(request ? request.url : String(input));
      const base = bases.find(
        (candidate) =>
          url.origin === candidate.origin &&
          (url.pathname === candidate.path ||
            url.pathname.startsWith(`${candidate.path}/`)),
      );
      if (!base) return undefined;
      const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
      const httpMethod =
        httpMethods.find((candidate) => candidate === method) ?? 'unknown';
      const path = url.pathname.slice(base.path.length);
      const operation =
        routes.find(
          ([verb, pattern]) => verb === method && pattern.test(path),
        )?.[2] ?? 'unknown';
      return { operation, httpMethod };
    } catch {
      return undefined;
    }
  };
}
