import type { Request } from "express";
import { Session } from "../models";
import type { UserDocument } from "../models/User";
import { httpError } from "../utils/httpError";
import { securityLog } from "../utils/securityLog";

/**
 * Re-authentication before sensitive account changes (ASVS 7.5.1, 7.5.2): changing the
 * e-mail or password, MFA settings, linking or unlinking Google, signing devices out and
 * deleting the account.
 *
 * A request passes when either
 * - it carries the account's factors itself: the current password if the account has
 *   one, and a current authenticator code if MFA is on (`currentPassword`, `mfaCode`); or
 * - this session authenticated fully within the last REAUTH_WINDOW_MS: it signed in that
 *   recently, or confirmed its factors on POST /api/auth/reauth.
 * Otherwise it is refused with 401 `reauth_required`; the frontend then asks for the
 * factors, posts them to /api/auth/reauth and retries.
 */
export const REAUTH_WINDOW_MS = 10 * 60 * 1000;
export const REAUTH_REQUIRED = "reauth_required";

/** Second-factor check, filled in by the MFA service; without MFA there is none. */
export type SecondFactorCheck = (user: UserDocument, code: unknown, req: Request) => Promise<boolean>;
let checkSecondFactor: SecondFactorCheck | null = null;
let hasSecondFactor: (user: UserDocument) => boolean = () => false;

export function registerSecondFactor(isEnabled: (user: UserDocument) => boolean, check: SecondFactorCheck): void {
  hasSecondFactor = isEnabled;
  checkSecondFactor = check;
}

export type ReauthMethod = "password" | "totp" | "google";

/** What this account must present to re-authenticate. */
export function reauthMethods(user: UserDocument): ReauthMethod[] {
  const methods: ReauthMethod[] = [];
  if (user.passwordHash) methods.push("password");
  if (hasSecondFactor(user)) methods.push("totp");
  // A Google-only account without MFA has nothing to type in: it signs in with Google again.
  if (methods.length === 0) methods.push("google");
  return methods;
}

/** Whether `body` carries every factor the account has. Logs a failed attempt. */
export async function factorsPresent(user: UserDocument, body: Record<string, unknown>, req: Request): Promise<boolean> {
  const methods = reauthMethods(user);
  if (methods.includes("google")) return false;
  if (methods.includes("password")) {
    const password = body.currentPassword;
    if (typeof password !== "string" || !(await user.comparePassword(password))) {
      if (password !== undefined) securityLog(req, { event: "auth.reauth", outcome: "failure", userId: user.id, reason: "bad_password" });
      return false;
    }
  }
  if (methods.includes("totp")) {
    if (!checkSecondFactor || !(await checkSecondFactor(user, body.mfaCode, req))) {
      if (body.mfaCode !== undefined) securityLog(req, { event: "auth.reauth", outcome: "failure", userId: user.id, reason: "bad_mfa_code" });
      return false;
    }
  }
  return true;
}

/** When this session last authenticated fully: its sign-in or its latest re-authentication. */
async function lastFullAuth(req: Request): Promise<number> {
  const session = await Session.findById(req.user!.sessionId).select("createdAt reauthAt").lean();
  if (!session) return 0;
  return Math.max(session.createdAt.getTime(), session.reauthAt?.getTime() ?? 0);
}

export async function isRecentlyAuthenticated(req: Request): Promise<boolean> {
  return Date.now() - (await lastFullAuth(req)) < REAUTH_WINDOW_MS;
}

/**
 * Pass, or throw 401 `reauth_required`. `user` must be loaded with `+passwordHash` (and the
 * MFA fields once MFA is on). Inline factors that check out also refresh the window.
 */
export async function requireRecentAuth(req: Request, user: UserDocument): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (await factorsPresent(user, body, req)) {
    await markReauthenticated(req);
    return;
  }
  if (await isRecentlyAuthenticated(req)) return;
  securityLog(req, { event: "auth.reauth_required", outcome: "blocked", severity: "NOTICE", userId: user.id });
  throw httpError(401, "Please confirm it's you", { code: REAUTH_REQUIRED, methods: reauthMethods(user) });
}

export async function markReauthenticated(req: Request): Promise<void> {
  await Session.updateOne({ _id: req.user!.sessionId }, { $set: { reauthAt: new Date() } });
}
