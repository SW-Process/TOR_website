import type { Request } from "express";

/**
 * Security event log (ASVS V16). One JSON object per line on stdout, which Cloud Run ships
 * to Cloud Logging: a separate system the application can't edit (16.4.2, 16.4.3), where
 * `severity` is understood natively (16.2.4). See docs/security/logging.md for the event
 * list and retention.
 *
 * Rules for what goes in an entry (16.2.5):
 * - never a password, token, cookie, TOTP code, recovery code or reset link;
 * - a user is identified by id; an email only when no account matched, and then masked;
 * - every value is JSON-encoded, so newlines or control characters in user input can't
 *   forge a second entry (16.4.1).
 */

export type SecurityOutcome = "success" | "failure" | "blocked";
export type SecuritySeverity = "INFO" | "NOTICE" | "WARNING" | "ERROR";

export interface SecurityEvent {
  /** Dotted event name, e.g. `auth.login`, `authz.denied`; listed in docs/security/logging.md. */
  event: string;
  outcome: SecurityOutcome;
  severity?: SecuritySeverity;
  /** Who: the account the event is about, when known. */
  userId?: string | null;
  /** Free-form details. Must follow the rules above. */
  [detail: string]: unknown;
}

type Sink = (line: string) => void;

const MAX_UA_LENGTH = 200;
const MAX_DETAIL_LENGTH = 500;

/** Under Jest the log stays quiet unless a test installs a sink. */
const defaultSink: Sink = (line) => {
  if (process.env.NODE_ENV === "test") return;
  process.stdout.write(line + "\n");
};
let sink: Sink = defaultSink;

/** Replace where entries go (tests); call with no argument to restore stdout. */
export function setSecurityLogSink(next?: Sink): void {
  sink = next ?? defaultSink;
}

/** `kob***@gmail.com`: enough to correlate attempts on one address, not to read it. */
export function maskEmail(email: unknown): string | undefined {
  if (typeof email !== "string") return undefined;
  const [local, domain] = email.trim().toLowerCase().split("@");
  if (!local || !domain) return "***";
  return `${local.slice(0, Math.min(3, local.length))}***@${domain}`;
}

function clip(value: unknown): unknown {
  if (typeof value === "string" && value.length > MAX_DETAIL_LENGTH) return value.slice(0, MAX_DETAIL_LENGTH) + "…";
  return value;
}

/** The request facts every entry carries: when, where (route, IP, device) and which request. */
function requestContext(req: Request | null | undefined): Record<string, unknown> {
  if (!req) return {};
  return {
    requestId: req.requestId,
    method: req.method,
    // The path only: query strings can carry search text or ids nobody needs in a log.
    path: (req.originalUrl ?? req.url ?? "").split("?")[0],
    ip: req.ip ?? null,
    userAgent: String(req.get?.("user-agent") ?? "").slice(0, MAX_UA_LENGTH),
    sessionId: req.user?.sessionId,
  };
}

/** Write one security event. Never throws: logging must not break the request it describes. */
export function securityLog(req: Request | null | undefined, entry: SecurityEvent): void {
  try {
    const { event, outcome, severity, userId, ...details } = entry;
    const clipped = Object.fromEntries(Object.entries(details).map(([k, v]) => [k, clip(v)]));
    const record = {
      severity: severity ?? (outcome === "success" ? "INFO" : "WARNING"),
      // ISO 8601 in UTC (16.2.2); Cloud Run's clock is NTP-synchronised by Google.
      time: new Date().toISOString(),
      logType: "security",
      event,
      outcome,
      userId: userId ?? req?.user?.id ?? null,
      ...requestContext(req),
      ...clipped,
    };
    sink(JSON.stringify(record));
  } catch {
    // ignore: see above
  }
}
