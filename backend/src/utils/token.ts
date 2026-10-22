import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import type { UserRole } from "../models/User";

/** Base name of the session cookie; see sessionCookieName() for the name actually used. */
export const COOKIE_NAME = "token";
/** The only algorithm sessions are signed with; verification rejects every other one, `none` included. */
const JWT_ALGORITHM = "HS256" as const;
/**
 * Who issues session tokens and who they are for (ASVS 9.2.3). The same secret signs
 * nothing else today, but these claims keep a session token from being accepted anywhere
 * it wasn't meant for if that ever changes (e.g. the MFA step token, utils/mfaToken).
 */
export const TOKEN_ISSUER = "tor-checker-api";
export const SESSION_AUDIENCE = "tor-checker-session";
/** What the token is for (ASVS 9.2.2): only a `session` token can authenticate a request. */
const SESSION_USE = "session";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function positiveNumber(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw !== undefined && raw !== "" && Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Absolute session lifetime (ASVS 7.3.2): a sign-in is good for at most this long, however
 * active the user is, then they sign in again. 12 hours is NIST SP 800-63B's AAL2 limit.
 * See docs/security/session-management.md.
 */
export function sessionLifetimeMs(): number {
  return positiveNumber(process.env.SESSION_MAX_HOURS, 12) * HOUR;
}

/** Inactivity timeout (ASVS 7.3.1): 30 minutes without a request ends the session (AAL2). */
export function sessionIdleTimeoutMs(): number {
  return positiveNumber(process.env.SESSION_IDLE_TIMEOUT_MINUTES, 30) * MINUTE;
}

export interface TokenPayload extends JwtPayload {
  sub: string;
  role: UserRole;
  /** User.tokenVersion at issue time. */
  tv: number;
  /** Session row id: every session token belongs to one. */
  sid: string;
  use: typeof SESSION_USE;
}

interface TokenUser {
  _id: unknown;
  role: UserRole;
  tokenVersion?: number;
}

export function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

/**
 * Sign the session token for session row `sessionId`. It expires with the row
 * (`expiresAt`), so re-issuing a cookie (after a password change, say) never extends a
 * session past its absolute lifetime.
 */
export function signToken(user: TokenUser, sessionId: string, expiresAt: Date): string {
  const seconds = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const options: SignOptions = {
    algorithm: JWT_ALGORITHM,
    subject: String(user._id),
    issuer: TOKEN_ISSUER,
    audience: SESSION_AUDIENCE,
    expiresIn: seconds,
  };
  return jwt.sign({ role: user.role, tv: user.tokenVersion ?? 0, sid: sessionId, use: SESSION_USE }, getSecret(), options);
}

/** Verify a session token and return its payload, or throw. */
export function verifyToken(token: string): TokenPayload {
  const payload = jwt.verify(token, getSecret(), {
    algorithms: [JWT_ALGORITHM],
    issuer: TOKEN_ISSUER,
    audience: SESSION_AUDIENCE,
  }) as Partial<TokenPayload>;
  if (payload.use !== SESSION_USE || typeof payload.sid !== "string" || typeof payload.sub !== "string") {
    throw new Error("Not a session token");
  }
  return payload as TokenPayload;
}

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  /** Always "/": required for `__Host-` cookies. */
  path: "/";
  maxAge?: number;
}

/**
 * Cookie options for the auth token — HttpOnly + Secure in production. `expiresAt` makes
 * the cookie end with its session; without it the options suit clearCookie().
 */
export function cookieOptions(expiresAt?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(expiresAt ? { maxAge: Math.max(0, expiresAt.getTime() - Date.now()) } : {}),
  };
}

/**
 * A cookie name with the `__Host-` prefix whenever cookies are Secure (production). The
 * browser then only accepts the cookie if it is Secure, has Path=/ and no Domain, so a
 * sibling subdomain or a plain-HTTP page can't plant or overwrite it (ASVS 3.3.1).
 * Local HTTP development and the tests keep the bare name, which browsers would refuse
 * with the prefix.
 */
export function cookieName(base: string): string {
  return cookieOptions().secure ? `__Host-${base}` : base;
}

/** The session cookie's name: `__Host-token` in production, `token` elsewhere. */
export function sessionCookieName(): string {
  return cookieName(COOKIE_NAME);
}
