import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";
process.env.CLIENT_ORIGIN = "http://localhost:3000";

let googleConfigured = true;
const exchangeMock = jest.fn();

jest.mock("../config/google", () => ({
  isGoogleOAuthConfigured: () => googleConfigured,
  buildGoogleAuthUrl: (state: string) =>
    `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
  exchangeCodeForIdentity: (...args: unknown[]) => exchangeMock(...args),
}));

import app from "../app";
import { User } from "../models";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await User.deleteMany({});
  jest.clearAllMocks();
  googleConfigured = true;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

/** Runs GET /api/auth/google, returns an agent holding the state cookie + the state value. */
async function beginFlow() {
  const agent = request.agent(app);
  const res = await agent.get("/api/auth/google");
  const state = new URL(res.headers.location as string).searchParams.get("state")!;
  return { agent, state };
}

describe("GET /api/auth/google", () => {
  it("redirects to Google's consent screen and sets a state cookie", async () => {
    const res = await request(app).get("/api/auth/google");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("accounts.google.com");
    expect(String(res.headers["set-cookie"])).toMatch(/oauth_state=/);
  });

  it("503s when Google OAuth is not configured", async () => {
    googleConfigured = false;
    const res = await request(app).get("/api/auth/google");
    expect(res.status).toBe(503);
  });
});

describe("GET /api/auth/google/callback", () => {
  it("rejects a mismatched state", async () => {
    const { agent } = await beginFlow();
    const res = await agent.get("/api/auth/google/callback?code=abc&state=wrong");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("http://localhost:3000/login?error=google_state");
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("creates a new vendor and sends them to onboarding", async () => {
    exchangeMock.mockResolvedValue({
      googleId: "g-123",
      email: "New.Person@gmail.com",
      emailVerified: true,
      name: "New Person",
    });
    const { agent, state } = await beginFlow();
    const res = await agent.get(`/api/auth/google/callback?code=abc&state=${state}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("http://localhost:3000/account/profile?onboarding=1");
    expect(String(res.headers["set-cookie"])).toMatch(/token=/);

    const user = await User.findOne({ email: "new.person@gmail.com" });
    expect(user).not.toBeNull();
    expect(user!.role).toBe("vendor");
    expect(user!.googleOAuthId).toBe("g-123");
  });

  it("links Google to an existing email account and sends them to the dashboard", async () => {
    await User.create({ email: "existing@test.com", role: "vendor" });
    exchangeMock.mockResolvedValue({
      googleId: "g-999",
      email: "existing@test.com",
      emailVerified: true,
    });
    const { agent, state } = await beginFlow();
    const res = await agent.get(`/api/auth/google/callback?code=abc&state=${state}`);

    expect(res.headers.location).toBe("http://localhost:3000/dashboard");
    const user = await User.findOne({ email: "existing@test.com" });
    expect(user!.googleOAuthId).toBe("g-999");
    expect(await User.countDocuments()).toBe(1);
  });

  it("reuses the account on a repeat sign-in", async () => {
    exchangeMock.mockResolvedValue({
      googleId: "g-abc",
      email: "repeat@test.com",
      emailVerified: true,
    });

    const first = await beginFlow();
    await first.agent.get(`/api/auth/google/callback?code=abc&state=${first.state}`);
    const second = await beginFlow();
    const res = await second.agent.get(`/api/auth/google/callback?code=abc&state=${second.state}`);

    expect(res.headers.location).toBe("http://localhost:3000/dashboard");
    expect(await User.countDocuments()).toBe(1);
  });

  it("refuses an unverified Google email", async () => {
    exchangeMock.mockResolvedValue({
      googleId: "g-x",
      email: "unverified@test.com",
      emailVerified: false,
    });
    const { agent, state } = await beginFlow();
    const res = await agent.get(`/api/auth/google/callback?code=abc&state=${state}`);

    expect(res.headers.location).toBe("http://localhost:3000/login?error=google_unverified_email");
    expect(await User.countDocuments()).toBe(0);
  });

  it("redirects to the login page when the code exchange fails", async () => {
    exchangeMock.mockRejectedValue(new Error("bad code"));
    const { agent, state } = await beginFlow();
    const res = await agent.get(`/api/auth/google/callback?code=abc&state=${state}`);
    expect(res.headers.location).toBe("http://localhost:3000/login?error=google_exchange");
  });
});

describe("linking Google from account settings", () => {
  const creds = { email: "vendor@test.com", password: "secret123" };
  const identity = { googleId: "g-123", email: "someone.else@gmail.com", emailVerified: true };

  /** A signed-in agent that has started the link flow; returns it with the state value. */
  async function beginLink() {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(creds).expect(201);
    const res = await agent.get("/api/auth/google/link").expect(302);
    const state = new URL(res.headers.location as string).searchParams.get("state")!;
    return { agent, state };
  }

  it("needs a session to start", async () => {
    await request(app).get("/api/auth/google/link").expect(401);
  });

  it("links a Google account with a different email to the signed-in user", async () => {
    exchangeMock.mockResolvedValue(identity);
    const { agent, state } = await beginLink();

    const res = await agent.get("/api/auth/google/callback").query({ code: "c", state });
    expect(res.headers.location).toBe("http://localhost:3000/account/settings?section=password&google=linked");

    const user = await User.findOne({ email: creds.email });
    expect(user?.googleOAuthId).toBe("g-123");
    expect(await User.countDocuments({})).toBe(1); // no account made for the Google email
    expect((await agent.get("/api/auth/me")).body.user.googleLinked).toBe(true);
  });

  it("refuses a Google account that already belongs to another user", async () => {
    await User.create({ email: "owner@test.com", role: "vendor", googleOAuthId: "g-123" });
    exchangeMock.mockResolvedValue(identity);
    const { agent, state } = await beginLink();

    const res = await agent.get("/api/auth/google/callback").query({ code: "c", state });
    expect(res.headers.location).toMatch(/google=taken$/);
    expect((await User.findOne({ email: creds.email }))?.googleOAuthId).toBeUndefined();
  });

  it("reports back to settings, not /login, when the link round trip fails", async () => {
    exchangeMock.mockRejectedValue(new Error("boom"));
    const { agent, state } = await beginLink();
    const res = await agent.get("/api/auth/google/callback").query({ code: "c", state });
    expect(res.headers.location).toMatch(/\/account\/settings\?section=password&google=error$/);
  });

  it("does not link when the session was signed out mid-flow", async () => {
    exchangeMock.mockResolvedValue(identity);
    const { agent, state } = await beginLink();
    await User.updateOne({ email: creds.email }, { $inc: { tokenVersion: 1 } });

    const res = await agent.get("/api/auth/google/callback").query({ code: "c", state });
    expect(res.headers.location).toMatch(/google=session$/);
    expect((await User.findOne({ email: creds.email }))?.googleOAuthId).toBeUndefined();
  });

  it("keeps the normal sign-in flow unchanged", async () => {
    exchangeMock.mockResolvedValue({ ...identity, email: "new@gmail.com" });
    const { agent, state } = await beginFlow();
    const res = await agent.get("/api/auth/google/callback").query({ code: "c", state });
    expect(res.headers.location).toBe("http://localhost:3000/account/profile?onboarding=1");
  });

  it("unlinks Google for an account with a password", async () => {
    exchangeMock.mockResolvedValue(identity);
    const { agent, state } = await beginLink();
    await agent.get("/api/auth/google/callback").query({ code: "c", state });

    const res = await agent.delete("/api/auth/google").expect(200);
    expect(res.body.user.googleLinked).toBe(false);
    const user = await User.findOne({ email: creds.email }).lean();
    expect(user).not.toHaveProperty("googleOAuthId");
  });

  it("refuses to unlink Google from a Google-only account", async () => {
    const user = await User.create({ email: "g@test.com", role: "vendor", googleOAuthId: "g-9" });
    const { signToken } = await import("../utils/token");
    await request(app).delete("/api/auth/google").set("Cookie", `token=${signToken(user)}`).expect(400);
    expect((await User.findById(user._id))?.googleOAuthId).toBe("g-9");
  });
});
