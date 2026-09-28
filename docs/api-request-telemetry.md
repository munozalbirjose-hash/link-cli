# API request telemetry plan

## Scope and counting

Record every explicit fetch attempt to Link API and authentication endpoints,
including requests without agent attribution. Polling, refreshes, and retries are
separate attempts. Automatic redirects inside fetch are one attempt. Merchant
requests and commands that make no requests produce no events.

Send one `API Request` event after fetch settles: `success` for HTTP 200–299,
`http_error` for other responses, or `transport_error` for rejection (including
timeouts and cancellation). Success describes receipt of response headers;
response-body failures and later command failures do not change that outcome.
Requests interrupted before completion may have no event.

## Implementation

1. Add a CLI-owned fetch wrapper and AEL client under `src/telemetry`. Inject the
   wrapper through `ResourceFactory` into the SDK and auth client, preserving
   their existing transports. Do not modify SDK resources, Incur, or commands.
2. Map known methods/routes to fixed operation names. Match configured base URLs
   and the fixed Link identity issuer. Unknown routes on tracked bases use
   `unknown`; request URLs and dynamic IDs never enter the payload.
3. Explicitly serialize only `client_id`, `event_name`, `event_value`, `event_id`,
   `created`, `operation`, `http_method`, optional `status_code`, `cli_version`,
   `os`, `arch`, and optional `ai_agent`. Runtime allowlists protect bounded
   fields. Agent detection never gates event emission.
4. Send URL-encoded POSTs to `https://r.stripe.com/0` with `Origin: link-cli` and
   `client_id=link-cli`. Use a separate Node HTTP/HTTPS transport for telemetry,
   with unreferenced sockets and cancellation that destroys connections even
   during TLS negotiation. Apply a
   three-second deadline and an eight-request concurrency cap; discard excess
   events. Do not retry, persist, follow redirects, or log telemetry failures.
5. Use Incur's existing exit override and awaitable CLI boundary to flush for at
   most 300 ms, aborting outstanding sends afterward and preserving the exit
   code. Flushing leaves the client usable for subsequent MCP calls. Direct
   process exits and signals remain best-effort.
6. Honor `DO_NOT_TRACK` and `LINK_CLI_TELEMETRY_OPTOUT` before constructing or
   scheduling events when either equals `1` or `true` (case-insensitive). Support
   `LINK_CLI_TELEMETRY_URL` for local tests; an invalid override disables sending.

No arguments, IDs, domains, URLs, identities, headers, credentials, payment data,
request/response bodies, raw errors, or stacks are included in events. Missing
`ai_agent` has no assigned interpretation. API User-Agent attribution continues
independently of AEL opt-out.

## Validation

- Disable telemetry by default throughout CLI tests; enable recorder tests only.
- Verify exact payloads, runtime allowlists, opt-out combinations, agent and
  unattributed requests, and secret-bearing extra properties.
- Verify outcomes, polling, refresh/retry counts, concurrent attempts, body and
  error preservation, endpoint scoping, and transport configuration.
- Exercise timeout, refusal, non-2xx, malformed override, redirect, concurrency,
  stalled TLS handshakes, and shutdown behavior without changing API output or
  exit status.
- Build SDK and CLI, run CLI typechecking and tests, and exercise the built CLI
  against local API/auth and AEL recorders, including an MCP server.

## Release prerequisite

Do not publish until mint registers the `link-cli` client and origin in AEL.
After deployment, send a development canary and verify its documented fields in
AEL tables. This implementation does not deploy registration or send a production
canary.
