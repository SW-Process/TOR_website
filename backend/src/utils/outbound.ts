import { securityLog } from "./securityLog";

/**
 * Outbound HTTP with an allowlist (ASVS 1.3.6, 13.2.4, 13.2.5, 15.3.2). The backend calls
 * a handful of known services; this wrapper makes sure that is all it can call:
 * - only `https:` (plain `http:` to localhost outside production, for local mocks);
 * - only hosts the caller allows, normally the hosts of its own configured base URLs
 *   (EGP_API_BASE, EGP_FILE_BASE, GPROC_BASE_URL), which only an operator can set;
 * - redirects are followed by hand, at most MAX_REDIRECTS, and only to an allowed host,
 *   so a compromised or spoofed upstream can't bounce us to an internal address
 *   (e.g. the cloud metadata server).
 * The full list of outbound destinations is in docs/security/communications.md.
 */

const MAX_REDIRECTS = 3;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export class OutboundBlockedError extends Error {
  constructor(readonly url: string, reason: string) {
    super(`Outbound request blocked (${reason}): ${url}`);
    this.name = "OutboundBlockedError";
  }
}

/** Host of a configured base URL, for building a client's allowlist. */
export function hostOf(base: string): string {
  return new URL(base).host.toLowerCase();
}

export function assertAllowedUrl(raw: string, allowedHosts: readonly string[]): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new OutboundBlockedError(raw, "malformed URL");
  }
  const host = url.host.toLowerCase();
  const localDev = url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname) && process.env.NODE_ENV !== "production";
  if (url.protocol !== "https:" && !localDev) throw new OutboundBlockedError(raw, "not https");
  if (url.username || url.password) throw new OutboundBlockedError(raw, "credentials in URL");
  if (!allowedHosts.map((h) => h.toLowerCase()).includes(host)) throw new OutboundBlockedError(raw, `host ${host} not allowed`);
  return url;
}

export interface SafeFetchOptions {
  allowedHosts: readonly string[];
  fetchFn?: typeof fetch;
}

/** fetch() limited to `allowedHosts`, following redirects only within them. */
export async function safeFetch(raw: string, init: RequestInit, options: SafeFetchOptions): Promise<Response> {
  // Looked up at call time, so a test's spy on global fetch is seen.
  const fetchFn: (u: string, i: RequestInit) => Promise<Response> = options.fetchFn ?? ((u, i) => globalThis.fetch(u, i));
  let url: URL;
  try {
    url = assertAllowedUrl(raw, options.allowedHosts);
  } catch (err) {
    securityLog(null, { event: "outbound.blocked", outcome: "blocked", url: raw.split("?")[0], reason: (err as Error).message });
    throw err;
  }
  let current: RequestInit = { ...init, redirect: "manual" };
  for (let hop = 0; ; hop += 1) {
    const res = await fetchFn(url.toString(), current);
    const location = res.headers?.get?.("location");
    if (res.status < 300 || res.status >= 400 || !location) return res;
    if (hop >= MAX_REDIRECTS) throw new OutboundBlockedError(url.toString(), "too many redirects");
    const next = new URL(location, url).toString();
    try {
      url = assertAllowedUrl(next, options.allowedHosts);
    } catch (err) {
      securityLog(null, { event: "outbound.blocked", outcome: "blocked", url: next.split("?")[0], reason: `redirect: ${(err as Error).message}` });
      throw err;
    }
    // 307/308 keep the method and body; the others become a plain GET, as browsers do.
    if (res.status !== 307 && res.status !== 308) current = { ...current, method: "GET", body: undefined };
  }
}
