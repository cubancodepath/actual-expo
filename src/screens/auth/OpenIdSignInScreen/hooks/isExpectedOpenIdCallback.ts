/**
 * Pure validator for the OpenID sign-in deep-link callback.
 *
 * The Actual sync server's OpenID flow does not echo a client-supplied
 * `state`/nonce query param back onto the app callback URL — it only
 * appends `?token=<token>` to the `returnUrl` the client originally sent
 * (see docs/architecture-differences.md, "OpenID sign-in callback" section,
 * for the upstream investigation). Response-authenticity therefore rests on
 * validating the callback URL's shape (scheme + hostname + path) before any
 * query params — including `token` — are read.
 *
 * The optional `nonce` parameter is forward-compatible: if a future upstream
 * server version echoes a `state` param, callers can pass the per-attempt
 * nonce here and this function will additionally require
 * `queryParams.state === nonce`.
 */
export const OPENID_CALLBACK_SCHEME = "actualbudget";
export const OPENID_CALLBACK_PATH = "/openid-cb";

export function isExpectedOpenIdCallback(url: string, hostname: string, nonce?: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // WHATWG URL keeps the trailing ':' on protocol.
  if (parsed.protocol !== `${OPENID_CALLBACK_SCHEME}:`) return false;
  if (parsed.hostname !== hostname) return false;
  if (parsed.pathname !== OPENID_CALLBACK_PATH) return false;

  if (nonce !== undefined) {
    const state = parsed.searchParams.get("state");
    if (state !== nonce) return false;
  }

  return true;
}
