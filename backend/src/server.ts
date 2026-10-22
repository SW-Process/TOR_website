import "dotenv/config";
import app from "./app";
import { connectDB } from "./config/db";
import { markInterruptedRunsFailed } from "./ingestion/runIngestion";

const PORT = process.env.PORT || 8000;
/** HS256 signing secret: at least 256 bits of entropy, e.g. `openssl rand -hex 32`. */
const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Refuse to boot without a strong session-signing secret. A missing or guessable
 * JWT_SECRET would let anyone forge a session cookie for any user, admins included.
 */
function assertSecrets(): void {
  const secret = process.env.JWT_SECRET ?? "";
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    console.error(`JWT_SECRET must be set and at least ${MIN_JWT_SECRET_LENGTH} characters (try: openssl rand -hex 32)`);
    process.exit(1);
  }
  // TOTP seeds are encrypted with this key (utils/secretBox); without it MFA can't work.
  if (process.env.NODE_ENV === "production" && !/^[0-9a-f]{64}$/i.test(process.env.MFA_ENCRYPTION_KEY ?? "")) {
    console.error("MFA_ENCRYPTION_KEY must be set to 64 hex characters in production (try: openssl rand -hex 32)");
    process.exit(1);
  }
}

async function start(): Promise<void> {
  assertSecrets();
  await connectDB();
  const swept = await markInterruptedRunsFailed();
  if (swept > 0) console.log(`Marked ${swept} interrupted ingestion run(s) as failed`);
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

void start();
