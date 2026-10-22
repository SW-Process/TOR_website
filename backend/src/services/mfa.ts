import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import type { Request, Response } from "express";
import { Session, User, type SessionMethod } from "../models";
import type { IRecoveryCode, UserDocument } from "../models/User";
import { base32Encode, generateTotpSecret, matchTotp, otpauthUri } from "../utils/totp";
import { open, seal } from "../utils/secretBox";
import { TOKEN_ISSUER, cookieName, cookieOptions, getSecret } from "../utils/token";
import { securityLog } from "../utils/securityLog";

/**
 * Multi-factor authentication with TOTP authenticator apps (ASVS 6.3.3, 6.5).
 *
 * - Set-up: a fresh 160-bit seed is shown once as a QR code, sealed with AES-GCM, and only
 *   switched on after the user types a code from it.
 * - Sign-in: a correct password (or Google) gives a 5-minute, single-use "MFA pending"
 *   cookie instead of a session; POST /api/auth/mfa/verify trades it plus a code for one.
 * - A code is accepted once (the last used step is stored) and only during its own 30 s
 *   step; recovery codes are single-use and bcrypt-hashed.
 * - Admins must have MFA on to use the admin panel (requireAdminMfa in middleware/auth).
 */

export const MFA_ISSUER = "TOR Checker";
const RECOVERY_CODE_COUNT = 10;
/** 10 base32 characters = 50 bits: below 112, so they're stored with bcrypt and a salt (6.5.2). */
const RECOVERY_CODE_LENGTH = 10;
const RECOVERY_HASH_COST = 10;
/** A seed being set up must be confirmed within this time. */
const SETUP_TTL_MS = 15 * 60 * 1000;
/** How long the password step stays good for while the user finds their phone. */
const PENDING_TTL_SECONDS = 5 * 60;
/** Wrong codes allowed on one pending sign-in before the password must be entered again. */
const MAX_PENDING_FAILURES = 5;
const MFA_AUDIENCE = "tor-checker-mfa";
const PENDING_USE = "mfa_pending";
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Fields the MFA checks read; none are selected by default. */
export const MFA_FIELDS = "+mfaSecretEnc +mfaLastStep +mfaRecoveryCodes +mfaPendingSecretEnc +mfaPendingAt";

/** Admin accounts need MFA for the admin panel unless ADMIN_MFA_REQUIRED=false (the test suite only). */
export function adminMfaRequired(): boolean {
  return (process.env.ADMIN_MFA_REQUIRED ?? "true").trim().toLowerCase() !== "false";
}

/* ------------------------------ recovery codes ----------------------------- */

function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

function newRecoveryCode(): string {
  const bytes = randomBytes(RECOVERY_CODE_LENGTH);
  let code = "";
  for (const b of bytes) code += BASE32[b & 31]; // 32 divides 256: no modulo bias
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

export async function generateRecoveryCodes(): Promise<{ plain: string[]; stored: IRecoveryCode[] }> {
  const plain = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
  const stored = await Promise.all(
    plain.map(async (c) => ({ hash: await bcrypt.hash(normalizeRecoveryCode(c), RECOVERY_HASH_COST), usedAt: null }))
  );
  return { plain, stored };
}

export function recoveryCodesLeft(user: Pick<UserDocument, "mfaRecoveryCodes">): number {
  return (user.mfaRecoveryCodes ?? []).filter((c) => !c.usedAt).length;
}

/* ------------------------------- code checks -------------------------------- */

export type FactorKind = "totp" | "recovery";

/**
 * Check a TOTP or recovery code for `userId` and use it up, atomically: two requests with
 * the same code can't both pass (ASVS 6.5.1). Returns which kind matched, or null.
 */
export async function verifyAndConsume(userId: unknown, rawCode: unknown): Promise<FactorKind | null> {
  if (typeof rawCode !== "string") return null;
  const code = rawCode.replace(/\s/g, "");
  const user = await User.findById(userId).select(MFA_FIELDS);
  if (!user?.mfaEnabled || !user.mfaSecretEnc) return null;

  if (/^\d{6}$/.test(code)) {
    // A seed that won't decrypt (wrong key, tampered value) fails closed: it's a wrong code.
    let secret: Buffer;
    try {
      secret = open(user.mfaSecretEnc, user.id);
    } catch {
      return null;
    }
    const step = matchTotp(secret, code);
    if (step === null) return null;
    const { modifiedCount } = await User.updateOne(
      { _id: user._id, $or: [{ mfaLastStep: null }, { mfaLastStep: { $lt: step } }] },
      { $set: { mfaLastStep: step } }
    );
    return modifiedCount === 1 ? "totp" : null; // 0: that step's code was already used
  }

  const candidate = normalizeRecoveryCode(code);
  if (candidate.length !== RECOVERY_CODE_LENGTH) return null;
  for (const stored of user.mfaRecoveryCodes) {
    if (stored.usedAt || !(await bcrypt.compare(candidate, stored.hash))) continue;
    const { modifiedCount } = await User.updateOne(
      { _id: user._id, mfaRecoveryCodes: { $elemMatch: { hash: stored.hash, usedAt: null } } },
      { $set: { "mfaRecoveryCodes.$.usedAt": new Date() } }
    );
    return modifiedCount === 1 ? "recovery" : null;
  }
  return null;
}

/* --------------------------------- set-up ----------------------------------- */

export interface MfaSetup {
  /** Base32 seed, for typing in by hand. */
  secret: string;
  otpauthUrl: string;
  /** The same URI as an SVG QR code. */
  qrSvg: string;
}

/** Start setting up MFA: a new seed, kept pending until confirmed with a code. */
export async function beginSetup(user: UserDocument): Promise<MfaSetup> {
  const secret = generateTotpSecret();
  await User.updateOne(
    { _id: user._id },
    { $set: { mfaPendingSecretEnc: seal(secret, user.id), mfaPendingAt: new Date() } }
  );
  const otpauthUrl = otpauthUri(secret, user.email, MFA_ISSUER);
  return { secret: base32Encode(secret), otpauthUrl, qrSvg: await QRCode.toString(otpauthUrl, { type: "svg", margin: 1 }) };
}

/** Confirm the pending seed with a code from it and switch MFA on. Returns the recovery codes, or null. */
export async function confirmSetup(userId: unknown, rawCode: unknown): Promise<string[] | null> {
  const user = await User.findById(userId).select(MFA_FIELDS);
  if (!user?.mfaPendingSecretEnc || !user.mfaPendingAt) return null;
  if (Date.now() - user.mfaPendingAt.getTime() > SETUP_TTL_MS) return null;
  if (typeof rawCode !== "string") return null;
  let secret: Buffer;
  try {
    secret = open(user.mfaPendingSecretEnc, user.id);
  } catch {
    return null;
  }
  const step = matchTotp(secret, rawCode.replace(/\s/g, ""));
  if (step === null) return null;

  const codes = await generateRecoveryCodes();
  const { modifiedCount } = await User.updateOne(
    { _id: user._id, mfaPendingSecretEnc: user.mfaPendingSecretEnc },
    {
      $set: {
        mfaEnabled: true,
        mfaEnabledAt: new Date(),
        mfaSecretEnc: user.mfaPendingSecretEnc,
        mfaLastStep: step, // the confirming code is used up too
        mfaRecoveryCodes: codes.stored,
        mfaPendingSecretEnc: null,
        mfaPendingAt: null,
      },
    }
  );
  return modifiedCount === 1 ? codes.plain : null;
}

export async function disableMfa(userId: unknown): Promise<void> {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        mfaEnabled: false,
        mfaEnabledAt: null,
        mfaSecretEnc: null,
        mfaLastStep: null,
        mfaRecoveryCodes: [],
        mfaPendingSecretEnc: null,
        mfaPendingAt: null,
        mfaPendingLoginJti: null,
      },
    }
  );
}

export async function replaceRecoveryCodes(userId: unknown): Promise<string[]> {
  const codes = await generateRecoveryCodes();
  await User.updateOne({ _id: userId }, { $set: { mfaRecoveryCodes: codes.stored } });
  return codes.plain;
}

/** This session has now checked the second factor (after set-up, the device it was set up on). */
export async function markSessionMfa(sessionId: string): Promise<void> {
  await Session.updateOne({ _id: sessionId }, { $set: { mfa: true, reauthAt: new Date() } });
}

/* ------------------------- the pending sign-in step ------------------------- */

interface PendingPayload {
  sub: string;
  jti: string;
  use: typeof PENDING_USE;
  method: SessionMethod;
}

export const mfaPendingCookie = () => cookieName("mfa_pending");

/**
 * The first factor passed: hand the browser a short-lived pending cookie instead of a
 * session. Only the latest one per account can be completed (its id is stored), and only
 * once, so it is bound to this sign-in attempt (6.6.2).
 */
export async function beginMfaLogin(res: Response, user: UserDocument, method: SessionMethod): Promise<void> {
  const jti = randomBytes(16).toString("hex"); // 128 bits (ASVS 11.5.1)
  await User.updateOne({ _id: user._id }, { $set: { mfaPendingLoginJti: jti, mfaPendingFailures: 0 } });
  const token = jwt.sign({ use: PENDING_USE, method }, getSecret(), {
    algorithm: "HS256",
    subject: user.id,
    issuer: TOKEN_ISSUER,
    audience: MFA_AUDIENCE,
    jwtid: jti,
    expiresIn: PENDING_TTL_SECONDS,
  });
  res.cookie(mfaPendingCookie(), token, { ...cookieOptions(), maxAge: PENDING_TTL_SECONDS * 1000 });
}

/** The pending sign-in behind this request's cookie, or null. */
export function readPending(req: Request): PendingPayload | null {
  const token = req.cookies?.[mfaPendingCookie()] as string | undefined;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, getSecret(), { algorithms: ["HS256"], issuer: TOKEN_ISSUER, audience: MFA_AUDIENCE }) as Partial<PendingPayload>;
    if (payload.use !== PENDING_USE || !payload.sub || !payload.jti || (payload.method !== "password" && payload.method !== "google")) return null;
    return payload as PendingPayload;
  } catch {
    return null;
  }
}

export type PendingOutcome = { user: UserDocument; method: SessionMethod; kind: FactorKind } | { error: "expired" | "bad_code" };

/** Finish a pending sign-in with a code. The pending step is used up on success, or after too many wrong codes. */
export async function completeMfaLogin(req: Request, code: unknown): Promise<PendingOutcome> {
  const pending = readPending(req);
  if (!pending) return { error: "expired" };
  const user = await User.findOne({ _id: pending.sub, mfaPendingLoginJti: pending.jti }).select("+mfaPendingLoginJti");
  if (!user) return { error: "expired" };

  const kind = await verifyAndConsume(user._id, code);
  if (!kind) {
    const after = await User.findOneAndUpdate(
      { _id: user._id, mfaPendingLoginJti: pending.jti },
      { $inc: { mfaPendingFailures: 1 } },
      { returnDocument: "after", projection: { mfaPendingFailures: 1 } }
    ).lean<{ mfaPendingFailures?: number }>();
    if ((after?.mfaPendingFailures ?? 0) >= MAX_PENDING_FAILURES) {
      await User.updateOne({ _id: user._id }, { $set: { mfaPendingLoginJti: null } });
      securityLog(req, { event: "auth.mfa_lockout", outcome: "blocked", userId: user.id, reason: "too_many_codes" });
    }
    return { error: "bad_code" };
  }
  // Used up: this pending step can't start a second session.
  const { modifiedCount } = await User.updateOne(
    { _id: user._id, mfaPendingLoginJti: pending.jti },
    { $set: { mfaPendingLoginJti: null, mfaPendingFailures: 0 } }
  );
  if (modifiedCount !== 1) return { error: "expired" };
  return { user, method: pending.method, kind };
}
