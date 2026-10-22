import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.GOOGLE_CALLBACK_URL = "http://localhost:8000/api/auth/google/callback";

import app from "../app";
import { Session, User } from "../models";
import { sessionCookieFor } from "./helpers/sessionCookie";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Promise.all([User.deleteMany({}), Session.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const creds = { email: "vendor@test.com", password: "vendor-test-pass-17" };

/** Make every session look like it signed in an hour ago (bypassing Mongoose's createdAt guard). */
async function ageSessions(): Promise<void> {
  await Session.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - 60 * 60_000) } });
}

async function signedIn() {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(creds).expect(201);
  return agent;
}

describe("re-authentication for sensitive changes (ASVS 7.5)", () => {
  it("lets a session that just signed in go ahead", async () => {
    const agent = await signedIn();
    await agent.post("/api/auth/logout-others").expect(200);
  });

  it("asks an older session to confirm it's the user", async () => {
    const agent = await signedIn();
    await ageSessions();

    const res = await agent.post("/api/auth/logout-others").expect(401);
    expect(res.body).toMatchObject({ code: "reauth_required", methods: ["password"] });
    expect((await agent.get("/api/auth/reauth").expect(200)).body.fresh).toBe(false);
    // the 401 is not a lost session: the session still works
    await agent.get("/api/auth/me").expect(200);
  });

  it("accepts the password on /reauth for the next 10 minutes", async () => {
    const agent = await signedIn();
    await ageSessions();

    const wrong = await agent.post("/api/auth/reauth").send({ currentPassword: "not-the-password" }).expect(401);
    expect(wrong.body.code).toBe("bad_credentials");
    await agent.post("/api/auth/reauth").send({ currentPassword: creds.password }).expect(200);
    expect((await agent.get("/api/auth/reauth")).body.fresh).toBe(true);
    await agent.post("/api/auth/logout-others").expect(200);
  });

  it("accepts the password sent with the change itself", async () => {
    const agent = await signedIn();
    await ageSessions();
    await agent.post("/api/auth/logout-others").send({ currentPassword: creds.password }).expect(200);
  });

  it("needs it to sign another device out, but not to sign this one out", async () => {
    const agent = await signedIn();
    const other = request.agent(app);
    await other.post("/api/auth/login").send(creds).expect(200);
    await ageSessions();
    const sessions = (await agent.get("/api/auth/sessions")).body.data as { id: string; current: boolean }[];

    const otherId = sessions.find((s) => !s.current)!.id;
    expect((await agent.delete(`/api/auth/sessions/${otherId}`).expect(401)).body.code).toBe("reauth_required");
    await agent.delete(`/api/auth/sessions/${sessions.find((s) => s.current)!.id}`).expect(204);
  });

  it("guards email changes and account deletion too", async () => {
    const agent = await signedIn();
    await ageSessions();
    // these already ask for the password, so sending it is enough
    await agent.put("/api/auth/email").send({ email: "new@test.com", currentPassword: creds.password }).expect(200);
    await agent.delete("/api/auth/me").send({ currentPassword: creds.password }).expect(200);
  });

  it("sends a Google-only account to sign in with Google again", async () => {
    const user = await User.create({ email: "g@test.com", role: "vendor", googleOAuthId: "gid-1" });
    const cookie = await sessionCookieFor(user);
    await ageSessions();

    const res = await request(app).post("/api/auth/logout-others").set("Cookie", cookie).expect(401);
    expect(res.body.methods).toEqual(["google"]);
    const reauth = await request(app).post("/api/auth/reauth").set("Cookie", cookie).send({}).expect(400);
    expect(reauth.body.code).toBe("reauth_google");
  });

  it("sends a stale session back to settings instead of starting a Google link", async () => {
    const agent = await signedIn();
    await ageSessions();
    const res = await agent.get("/api/auth/google/link").expect(302);
    expect(res.headers.location).toContain("google=reauth");

    await agent.post("/api/auth/reauth").send({ currentPassword: creds.password }).expect(200);
    const ok = await agent.get("/api/auth/google/link").expect(302);
    expect(ok.headers.location).toContain("accounts.google.com");
  });
});
