import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import type { UserRole } from "../models/User";

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
/** Base name of the session cookie; see sessionCookieName() for the name actually used. */
export const COOKIE_NAME = "token";
/** The only algorithm sessions are signed with; verification rejects every other one, `none` included. */
const JWT_ALGORITHM = "HS256" as const;

export interface TokenPayload extends JwtPayload {
  sub: string;
  role: UserRole;
  /** User.tokenVersion at issue time; absent on tokens issued before it existed (read as 0). */
  tv?: number;
  /** Session row id; absent on tokens issued before sessions were tracked. */
  sid?: string;
}

interface TokenUser {
  _id: unknown;
  role: UserRole;
  tokenVersion?: number;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

/** Sign a JWT carrying the user id, role, token version and (when known) session id. */
export function signToken(user: TokenUser, sessionId?: string): string {
  const options: SignOptions = {
    algorithm: JWT_ALGORITHM,
    subject: String(user._id),
    expiresIn: JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };
  const claims = { role: user.role, tv: user.tokenVersion ?? 0, ...(sessionId ? { sid: sessionId } : {}) };
  return jwt.sign(claims, getSecret(), options);
}

/** Verify a JWT and return its payload, or throw. */
export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, getSecret(), { algorithms: [JWT_ALGORITHM] }) as TokenPayload;
}

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  /** Always "/": required for `__Host-` cookies. */
  path: "/";
  maxAge: number;
}

/** How long a session (token and its row) lasts, in milliseconds. */
export function sessionLifetimeMs(): number {
  return (Number.parseInt(JWT_EXPIRES_IN, 10) || 7) * 24 * 60 * 60 * 1000;
}

/** Cookie options for the auth token — HttpOnly + Secure in production. */
export function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionLifetimeMs(),
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
