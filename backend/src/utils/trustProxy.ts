/**
 * Express "trust proxy" from TRUST_PROXY. Unset/blank keeps Express's default (trust
 * nothing: req.ip is the TCP peer). Behind a load balancer that peer is the proxy, so
 * every sign-in session would record the proxy's IP — set the number of proxy hops in
 * front of the app (e.g. "1" for a single load balancer) or their addresses/subnets.
 * "true" trusts any X-Forwarded-For value, which lets clients spoof their IP, so it's
 * accepted but best avoided.
 */
export function parseTrustProxy(raw: string | undefined): boolean | number | string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  if (value === "true") return true;
  if (value === "false") return false;
  return value; // e.g. "loopback, 10.0.0.0/8"
}
