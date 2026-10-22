import type { Request, Response } from "express";
import { User } from "../models";
import type { UserDocument } from "../models/User";
import { httpError } from "../utils/httpError";
import { securityLog } from "../utils/securityLog";
import { cookieOptions } from "../utils/token";
import { startSession } from "../services/sessions";
import { requireRecentAuth } from "../services/reauth";
import {
  adminMfaRequired,
  beginSetup,
  completeMfaLogin,
  confirmSetup,
  disableMfa,
  markSessionMfa,
  mfaPendingCookie,
  replaceRecoveryCodes,
} from "../services/mfa";
import { accountView } from "./authController";

async function loadAccount(req: Request): Promise<UserDocument> {
  const user = await User.findById(req.user!.id).select("+passwordHash +mfaRecoveryCodes");
  if (!user) throw httpError(401, "Account no longer exists");
  return user;
}

/**
 * POST /api/auth/mfa/verify — the second step of signing in: the pending cookie from the
 * password (or Google) step plus a code from the authenticator app, or a recovery code.
 */
export async function verifyMfaLogin(req: Request, res: Response): Promise<void> {
  const outcome = await completeMfaLogin(req, (req.body ?? {}).code);
  if ("error" in outcome) {
    securityLog(req, { event: "auth.mfa_verify", outcome: "failure", reason: outcome.error });
    if (outcome.error === "expired") {
      res.clearCookie(mfaPendingCookie(), cookieOptions());
      throw httpError(401, "Sign-in step expired, please sign in again", { code: "mfa_expired" });
    }
    throw httpError(401, "The code is incorrect", { code: "bad_code" });
  }
  res.clearCookie(mfaPendingCookie(), cookieOptions());
  securityLog(req, { event: "auth.mfa_verify", outcome: "success", userId: outcome.user.id, factor: outcome.kind, method: outcome.method });
  if (outcome.kind === "recovery") {
    securityLog(req, { event: "auth.recovery_code_used", outcome: "success", severity: "NOTICE", userId: outcome.user.id });
  }
  await startSession(req, res, outcome.user, outcome.method, { mfa: true });
  const fresh = await User.findById(outcome.user._id).select("+passwordHash +mfaRecoveryCodes");
  res.status(200).json({ user: fresh ? { ...accountView(fresh), sessionMfa: true } : outcome.user });
}

/** POST /api/auth/mfa/setup — start setting up an authenticator app: a new seed and its QR code. */
export async function startMfaSetup(req: Request, res: Response): Promise<void> {
  const user = await loadAccount(req);
  if (user.mfaEnabled) throw httpError(409, "Two-step verification is already on");
  await requireRecentAuth(req, user);
  const setup = await beginSetup(user);
  securityLog(req, { event: "auth.mfa_setup_start", outcome: "success" });
  res.status(200).json(setup);
}

/**
 * POST /api/auth/mfa/enable — confirm the new seed with a code and switch MFA on. Answers
 * with the recovery codes, shown once. This session counts as MFA-verified from now on.
 */
export async function enableMfa(req: Request, res: Response): Promise<void> {
  const codes = await confirmSetup(req.user!.id, (req.body ?? {}).code);
  if (!codes) {
    securityLog(req, { event: "auth.mfa_enable", outcome: "failure", reason: "bad_or_expired_code" });
    throw httpError(400, "The code is incorrect or the set-up expired", { code: "bad_code" });
  }
  await markSessionMfa(req.user!.sessionId);
  req.user!.mfa = true;
  securityLog(req, { event: "auth.mfa_enable", outcome: "success", severity: "NOTICE" });
  res.status(200).json({ recoveryCodes: codes, user: accountView(await loadAccount(req), req) });
}

/** POST /api/auth/mfa/disable — switch MFA off (needs re-authentication). Admins can't. */
export async function turnOffMfa(req: Request, res: Response): Promise<void> {
  const user = await loadAccount(req);
  if (!user.mfaEnabled) throw httpError(400, "Two-step verification is not on");
  if (user.role === "admin" && adminMfaRequired()) {
    securityLog(req, { event: "auth.mfa_disable", outcome: "blocked", reason: "admin_requires_mfa" });
    throw httpError(403, "Admin accounts must keep two-step verification on");
  }
  await requireRecentAuth(req, user);
  await disableMfa(user._id);
  securityLog(req, { event: "auth.mfa_disable", outcome: "success", severity: "NOTICE" });
  res.status(200).json({ user: accountView(await loadAccount(req), req) });
}

/** POST /api/auth/mfa/recovery-codes — replace every recovery code with 10 new ones (needs re-authentication). */
export async function regenerateRecoveryCodes(req: Request, res: Response): Promise<void> {
  const user = await loadAccount(req);
  if (!user.mfaEnabled) throw httpError(400, "Two-step verification is not on");
  await requireRecentAuth(req, user);
  const codes = await replaceRecoveryCodes(user._id);
  securityLog(req, { event: "auth.recovery_codes_regenerate", outcome: "success", severity: "NOTICE" });
  res.status(200).json({ recoveryCodes: codes, user: accountView(await loadAccount(req), req) });
}
