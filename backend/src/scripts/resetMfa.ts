/**
 * Turn off two-step verification for an account that lost both its authenticator and its
 * recovery codes (ASVS 6.4.4). Only for after the identity check in
 * docs/security/authentication-defenses.md ("Lost second factor"): it needs database
 * access, so only an operator can run it, never the web app. Every session of the
 * account is ended and the reset is written to the security log.
 *
 *   npm run reset-mfa -- <email> "<ticket or reason>"
 */
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Session, User } from "../models";
import { disableMfa } from "../services/mfa";
import { securityLog, setSecurityLogSink } from "../utils/securityLog";

async function main(): Promise<void> {
  const [email, reason] = process.argv.slice(2);
  if (!email || !reason) {
    console.error('Usage: npm run reset-mfa -- <email> "<ticket or reason>"');
    process.exit(1);
  }
  setSecurityLogSink((line) => process.stdout.write(line + "\n"));
  await connectDB();

  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (!user) {
    console.error(`No account with email ${email}`);
    await mongoose.disconnect();
    process.exit(1);
  }
  await disableMfa(user._id);
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();
  const { deletedCount } = await Session.deleteMany({ userId: user._id });
  securityLog(null, {
    event: "auth.mfa_reset_by_operator",
    outcome: "success",
    severity: "WARNING",
    userId: user.id,
    reason,
    sessionsEnded: deletedCount,
  });
  console.log(`Two-step verification turned off for ${user.email}; ${deletedCount} session(s) ended.`);
  if (user.role === "admin") console.log("This is an admin: they must set up two-step verification again before using the admin panel.");
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
