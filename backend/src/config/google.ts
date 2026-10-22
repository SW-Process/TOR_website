import { createHash, randomBytes } from "node:crypto";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";

/**
 * Google OAuth 2.0 client (FR-21).
 *
 * Needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_CALLBACK_URL.
 * `isGoogleOAuthConfigured()` lets the routes 503 cleanly when they are absent
 * (e.g. a teammate running the API without Google credentials).
 */
const GOOGLE_SCOPES = ["openid", "email", "profile"];

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_CALLBACK_URL
  );
}

let client: OAuth2Client | null = null;

export function getGoogleClient(): OAuth2Client {
  if (!isGoogleOAuthConfigured()) {
    throw new Error("Google OAuth is not configured");
  }
  client ??= new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_CALLBACK_URL,
  });
  return client;
}

/**
 * Per-attempt secrets, kept in the browser's HttpOnly state cookie (ASVS 10.1.2):
 * - `codeVerifier` for PKCE (RFC 7636, S256): a stolen authorization code is useless
 *   without it (10.2.1);
 * - `nonce`, which Google copies into the ID token: an ID token from another sign-in
 *   attempt can't be replayed into this one (10.5.1).
 * Both are 256-bit CSPRNG values.
 */
export interface GoogleFlowSecrets {
  codeVerifier: string;
  nonce: string;
}

export function newFlowSecrets(): GoogleFlowSecrets {
  return { codeVerifier: randomBytes(32).toString("base64url"), nonce: randomBytes(32).toString("base64url") };
}

/** The Google consent-screen URL to redirect the browser to. */
export function buildGoogleAuthUrl(state: string, secrets: GoogleFlowSecrets): string {
  return getGoogleClient().generateAuthUrl({
    scope: GOOGLE_SCOPES,
    state,
    prompt: "select_account",
    nonce: secrets.nonce,
    code_challenge_method: CodeChallengeMethod.S256,
    code_challenge: createHash("sha256").update(secrets.codeVerifier).digest("base64url"),
  });
}

export interface GoogleIdentity {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

/**
 * Exchange the callback `code` (with the PKCE verifier) for the caller's verified Google
 * identity. The ID token's signature, issuer, audience and expiry are checked by
 * verifyIdToken (10.5.3, 10.5.4), its nonce here (10.5.1).
 */
export async function exchangeCodeForIdentity(
  code: string,
  secrets: GoogleFlowSecrets,
  oauth: Pick<OAuth2Client, "getToken" | "verifyIdToken"> = getGoogleClient()
): Promise<GoogleIdentity> {
  const { tokens } = await oauth.getToken({ code, codeVerifier: secrets.codeVerifier });
  if (!tokens.id_token) throw new Error("Google response had no id_token");

  const ticket = await oauth.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error("Google id_token payload was incomplete");
  }
  if (payload.nonce !== secrets.nonce) {
    throw new Error("Google id_token nonce does not match this sign-in");
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: payload.name,
  };
}
