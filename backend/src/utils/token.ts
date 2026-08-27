import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import type { UserRole } from "../models/User";

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
export const COOKIE_NAME = "token";

export interface TokenPayload extends JwtPayload {
  sub: string;
  role: UserRole;
}

interface TokenUser {
  _id: unknown;
  role: UserRole;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

/** Sign a JWT carrying the user id and role. */
export function signToken(user: TokenUser): string {
  const options: SignOptions = {
    subject: String(user._id),
    expiresIn: JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };
  return jwt.sign({ role: user.role }, getSecret(), options);
}

/** Verify a JWT and return its payload, or throw. */
export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, getSecret()) as TokenPayload;
}

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  maxAge: number;
}

/** Cookie options for the auth token — HttpOnly + Secure in production. */
export function cookieOptions(): CookieOptions {
  const days = Number.parseInt(JWT_EXPIRES_IN, 10) || 7;
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: days * 24 * 60 * 60 * 1000,
  };
}
