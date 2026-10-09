import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";

import app from "../app";
import { Session, User } from "../models";
import { setEmailSenderForTest } from "../email";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  setEmailSenderForTest(null);
  await Promise.all([User.deleteMany({}), Session.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const creds = { email: "vendor@test.com", password: "secret123" };

/** Register `creds`, grab the mailed reset link's token from the fake sender, and return it. */
async function requestResetToken(email = creds.email): Promise<string> {
  await request(app).post("/api/auth/register").send(creds);
  const sent: Array<{ to: string; text: string }> = [];
  setEmailSenderForTest({ send: async (m) => { sent.push(m as { to: string; text: string }); } });

  await request(app).post("/api/auth/forgot-password").send({ email });
  const link = sent[0]?.text.match(/reset-password\?token=([^\s]+)/)?.[1];
  if (!link) throw new Error("no reset link captured");
  return link;
}

describe("POST /api/auth/forgot-password", () => {
  it("emails a reset link for a registered address", async () => {
    await request(app).post("/api/auth/register").send(creds);
    const sent: Array<{ to: string; subject: string; text: string }> = [];
    setEmailSenderForTest({ send: async (m) => { sent.push(m as never); } });

    const res = await request(app).post("/api/auth/forgot-password").send({ email: creds.email });

    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(creds.email);
    expect(sent[0]?.text).toContain("/reset-password?token=");

    const user = await User.findOne({ email: creds.email }).select("+resetPasswordTokenHash +resetPasswordExpiresAt");
    expect(user?.resetPasswordTokenHash).toBeTruthy();
    expect(user?.resetPasswordExpiresAt?.getTime()).toBeGreaterThan(Date.now());
  });

  it("answers the same way for an unregistered address and sends no email", async () => {
    const sent: unknown[] = [];
    setEmailSenderForTest({ send: async (m) => { sent.push(m); } });

    const res = await request(app).post("/api/auth/forgot-password").send({ email: "nobody@test.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("If that email has an account, a reset link is on its way");
    expect(sent).toHaveLength(0);
  });

  it("400s on a malformed email", async () => {
    const res = await request(app).post("/api/auth/forgot-password").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("still emails a link for a Google-only account (no password set yet)", async () => {
    const user = await User.create({ email: "g@test.com", role: "vendor", googleOAuthId: "g-123" });
    expect(user.passwordHash).toBeNull();
    const sent: unknown[] = [];
    setEmailSenderForTest({ send: async (m) => { sent.push(m); } });

    const res = await request(app).post("/api/auth/forgot-password").send({ email: "g@test.com" });

    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
  });

  it("does not fail the request when sending the email itself errors", async () => {
    await request(app).post("/api/auth/register").send(creds);
    setEmailSenderForTest({ send: async () => { throw new Error("smtp down"); } });

    const res = await request(app).post("/api/auth/forgot-password").send({ email: creds.email });
    expect(res.status).toBe(200);
  });

  describe("cooldown", () => {
    it("sends no second email for a repeat request right after the first", async () => {
      await request(app).post("/api/auth/register").send(creds);
      const sent: unknown[] = [];
      setEmailSenderForTest({ send: async (m) => { sent.push(m); } });

      await request(app).post("/api/auth/forgot-password").send({ email: creds.email });
      const res = await request(app).post("/api/auth/forgot-password").send({ email: creds.email });

      expect(res.status).toBe(200);
      expect(sent).toHaveLength(1);
    });

    it("keeps the first token valid while a repeat request is on cooldown", async () => {
      const token = await requestResetToken();
      await request(app).post("/api/auth/forgot-password").send({ email: creds.email });

      const res = await request(app).post("/api/auth/reset-password").send({ token, password: "newpassword1" });
      expect(res.status).toBe(200);
    });

    it("sends a new email once the cooldown has passed", async () => {
      await request(app).post("/api/auth/register").send(creds);
      const sent: unknown[] = [];
      setEmailSenderForTest({ send: async (m) => { sent.push(m); } });
      await request(app).post("/api/auth/forgot-password").send({ email: creds.email });

      // Back-date the token as if it (and the cooldown) was issued a couple of minutes ago.
      await User.updateOne(
        { email: creds.email },
        { $set: { resetPasswordExpiresAt: new Date(Date.now() + 58 * 60_000) } }
      );
      const res = await request(app).post("/api/auth/forgot-password").send({ email: creds.email });

      expect(res.status).toBe(200);
      expect(sent).toHaveLength(2);
    });
  });
});

describe("POST /api/auth/reset-password", () => {
  it("sets a new password, usable on the next login", async () => {
    const token = await requestResetToken();

    const res = await request(app).post("/api/auth/reset-password").send({ token, password: "newpassword1" });
    expect(res.status).toBe(200);

    const login = await request(app).post("/api/auth/login").send({ email: creds.email, password: "newpassword1" });
    expect(login.status).toBe(200);
    const oldLogin = await request(app).post("/api/auth/login").send(creds);
    expect(oldLogin.status).toBe(401);
  });

  it("consumes the token: reusing it fails", async () => {
    const token = await requestResetToken();
    await request(app).post("/api/auth/reset-password").send({ token, password: "newpassword1" });

    const res = await request(app).post("/api/auth/reset-password").send({ token, password: "anotherone1" });
    expect(res.status).toBe(400);
  });

  it("signs out every existing session on reset", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(creds);
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);

    const token = await requestResetToken();
    await request(app).post("/api/auth/reset-password").send({ token, password: "newpassword1" });

    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("400s on an expired token", async () => {
    const token = await requestResetToken();
    await User.updateOne({ email: creds.email }, { $set: { resetPasswordExpiresAt: new Date(Date.now() - 1000) } });

    const res = await request(app).post("/api/auth/reset-password").send({ token, password: "newpassword1" });
    expect(res.status).toBe(400);
  });

  it("400s on a tampered token", async () => {
    const token = await requestResetToken();
    const [userId] = token.split(".");
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: `${userId}.not-the-real-token`, password: "newpassword1" });
    expect(res.status).toBe(400);
  });

  it("400s on a malformed token", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "not-a-real-token", password: "newpassword1" });
    expect(res.status).toBe(400);
  });

  it("400s on a short password", async () => {
    const token = await requestResetToken();
    const res = await request(app).post("/api/auth/reset-password").send({ token, password: "short" });
    expect(res.status).toBe(400);
  });

  it("lets a Google-only account set its first password this way", async () => {
    await User.create({ email: "g2@test.com", role: "vendor", googleOAuthId: "g-456" });
    const token = await requestResetToken("g2@test.com");

    const res = await request(app).post("/api/auth/reset-password").send({ token, password: "newpassword1" });
    expect(res.status).toBe(200);

    const login = await request(app).post("/api/auth/login").send({ email: "g2@test.com", password: "newpassword1" });
    expect(login.status).toBe(200);
  });
});
