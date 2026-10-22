import { createHash } from "node:crypto";

process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.GOOGLE_CALLBACK_URL = "http://localhost:8000/api/auth/google/callback";

import { buildGoogleAuthUrl, exchangeCodeForIdentity, newFlowSecrets } from "../google";

describe("Google sign-in hardening (ASVS 10.1.2, 10.2.1, 10.5.1)", () => {
  it("asks Google for an S256 PKCE challenge and a nonce", () => {
    const secrets = newFlowSecrets();
    const url = new URL(buildGoogleAuthUrl("state-1", secrets));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(createHash("sha256").update(secrets.codeVerifier).digest("base64url"));
    expect(url.searchParams.get("nonce")).toBe(secrets.nonce);
    expect(url.searchParams.get("state")).toBe("state-1");
  });

  function fakeClient(payload: Record<string, unknown>) {
    const getToken = jest.fn().mockResolvedValue({ tokens: { id_token: "id.token.sig" } });
    const verifyIdToken = jest.fn().mockResolvedValue({ getPayload: () => payload });
    return { getToken, verifyIdToken } as unknown as Parameters<typeof exchangeCodeForIdentity>[2] & {
      getToken: jest.Mock;
      verifyIdToken: jest.Mock;
    };
  }

  it("sends the code verifier with the code, and accepts a matching nonce", async () => {
    const secrets = newFlowSecrets();
    const client = fakeClient({ sub: "g-1", email: "a@gmail.com", email_verified: true, nonce: secrets.nonce });
    const identity = await exchangeCodeForIdentity("the-code", secrets, client);
    expect(identity).toMatchObject({ googleId: "g-1", emailVerified: true });
    expect(client.getToken).toHaveBeenCalledWith({ code: "the-code", codeVerifier: secrets.codeVerifier });
    expect(client.verifyIdToken).toHaveBeenCalledWith(expect.objectContaining({ audience: "test-client-id" }));
  });

  it("refuses an ID token whose nonce belongs to another sign-in", async () => {
    const secrets = newFlowSecrets();
    const client = fakeClient({ sub: "g-1", email: "a@gmail.com", email_verified: true, nonce: "someone-elses" });
    await expect(exchangeCodeForIdentity("the-code", secrets, client)).rejects.toThrow(/nonce/);
  });
});
