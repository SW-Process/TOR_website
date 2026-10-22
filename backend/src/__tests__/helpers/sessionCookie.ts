import type { Types } from "mongoose";
import { Session } from "../../models";
import { signToken } from "../../utils/token";
import type { UserRole } from "../../models/User";

/**
 * A `Cookie` header value for a fresh session of `user`, for accounts a test can't sign in
 * through the API (e.g. Google-only accounts, which have no password).
 */
export async function sessionCookieFor(
  user: { _id: Types.ObjectId; role: UserRole; tokenVersion?: number },
  options: { mfa?: boolean } = {}
): Promise<string> {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const session = await Session.create({ userId: user._id, method: "google", expiresAt, mfa: options.mfa ?? false });
  return `token=${signToken(user, session.id, expiresAt)}`;
}
