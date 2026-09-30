import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

/** AEL-only transport: no API headers, redirect following, or retained sockets. */
export function postTelemetry(
  endpoint: URL,
  body: URLSearchParams,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const payload = body.toString();
    const request = endpoint.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = request(
      endpoint,
      {
        method: 'POST',
        headers: {
          Origin: 'link-cli',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(payload),
        },
        agent: false,
        signal,
      },
      (response) => {
        // Any response finishes the attempt. Do not read bodies or follow redirects.
        response.destroy();
        resolve();
      },
    );
    req.on('error', reject);
    // The command and bounded flush own process lifetime, not analytics sockets.
    // ClientRequest's abort signal also destroys a pending TLS handshake; fetch
    // can leave that connection alive after rejecting its request promise.
    req.on('socket', (socket) => socket.unref());
    req.end(payload);
  });
}
