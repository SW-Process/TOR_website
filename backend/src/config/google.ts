import { OAuth2Client } from "google-auth-library";

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

/** The Google consent-screen URL to redirect the browser to. */
export function buildGoogleAuthUrl(state: string): string {
  return getGoogleClient().generateAuthUrl({
    scope: GOOGLE_SCOPES,
    state,
    prompt: "select_account",
  });
}

export interface GoogleIdentity {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

/** Exchange the callback `code` for the caller's verified Google identity. */
export async function exchangeCodeForIdentity(code: string): Promise<GoogleIdentity> {
  const oauth = getGoogleClient();
  const { tokens } = await oauth.getToken(code);
  if (!tokens.id_token) throw new Error("Google response had no id_token");

  const ticket = await oauth.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error("Google id_token payload was incomplete");
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: payload.name,
  };
}
