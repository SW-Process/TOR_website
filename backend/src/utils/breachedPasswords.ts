import { createHash } from "node:crypto";
import { safeFetch } from "./outbound";
import { securityLog } from "./securityLog";

/**
 * Breached-password check (ASVS 6.2.12) against Have I Been Pwned's Pwned Passwords, using
 * its k-anonymity range API: only the first 5 hex characters of the password's SHA-1 leave
 * the server, the service answers with every suffix sharing that prefix, and the match is
 * done here. `Add-Padding` makes every answer the same size, so even the response length
 * says nothing. Nothing about the password or the user is sent.
 *
 * If the service can't be reached in time, the password is accepted (fail open) and the
 * failure is logged: the local common-password and context-word checks still apply, and
 * an outage elsewhere shouldn't stop anyone signing up. BREACHED_PASSWORD_CHECK=false
 * turns the check off (the test suite does).
 */
const RANGE_API = "https://api.pwnedpasswords.com/range/";
const ALLOWED_HOSTS = ["api.pwnedpasswords.com"];
const TIMEOUT_MS = 3000;

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
let fetchOverride: FetchLike | undefined;

/** Swap the HTTP call (tests). */
export function setBreachFetch(fn?: FetchLike): void {
  fetchOverride = fn;
}

function enabled(): boolean {
  return (process.env.BREACHED_PASSWORD_CHECK ?? "true").trim().toLowerCase() !== "false";
}

export async function isBreachedPassword(password: string): Promise<boolean> {
  if (!enabled()) return false;
  const sha1 = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await safeFetch(
      RANGE_API + prefix,
      {
        method: "GET",
        headers: { "Add-Padding": "true", "User-Agent": "TOR-Checker-password-check" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
      { allowedHosts: ALLOWED_HOSTS, fetchFn: fetchOverride }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    for (const line of body.split("\n")) {
      const [hash, count] = line.trim().split(":");
      if (hash === suffix && Number(count) > 0) return true; // padding rows have count 0
    }
    return false;
  } catch (err) {
    securityLog(null, {
      event: "dependency.unavailable",
      outcome: "failure",
      severity: "WARNING",
      service: "pwnedpasswords",
      effect: "breach check skipped (fail open)",
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
