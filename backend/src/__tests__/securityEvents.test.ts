import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";

import app from "../app";
import { User } from "../models";
import { setSecurityLogSink } from "../utils/securityLog";

let mongod: MongoMemoryServer;
let events: Record<string, unknown>[];
const PASSWORD = "vendor-test-pass-17";

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

beforeEach(() => {
  events = [];
  setSecurityLogSink((line) => events.push(JSON.parse(line)));
});

afterEach(async () => {
  setSecurityLogSink();
  await User.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const named = (event: string) => events.filter((e) => e.event === event);

describe("security events (ASVS 16.3)", () => {
  it("logs successful and failed sign-ins without the password (16.3.1, 16.2.5)", async () => {
    await request(app).post("/api/auth/register").send({ email: "v@test.com", password: PASSWORD }).expect(201);
    await request(app).post("/api/auth/login").send({ email: "v@test.com", password: "wrong-password-1" }).expect(401);
    await request(app).post("/api/auth/login").send({ email: "nobody@test.com", password: PASSWORD }).expect(401);
    await request(app).post("/api/auth/login").send({ email: "v@test.com", password: PASSWORD }).expect(200);

    const logins = named("auth.login");
    expect(logins.map((e) => [e.outcome, e.reason ?? null])).toEqual([
      ["failure", "bad_password"],
      ["failure", "unknown_account"],
      ["success", null],
    ]);
    expect(logins[1]!.email).toBe("nob***@test.com");
    expect(named("auth.register")[0]).toMatchObject({ outcome: "success", method: "password" });
    const all = JSON.stringify(events);
    expect(all).not.toContain(PASSWORD);
    expect(all).not.toContain("wrong-password-1");
    for (const e of logins) expect(e).toMatchObject({ method: "password", path: "/api/auth/login" });
  });

  it("logs failed authorization (16.3.2)", async () => {
    await request(app).get("/api/auth/me").expect(401);
    await request(app).get("/api/auth/me").set("Cookie", "token=forged").expect(401);
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "v@test.com", password: PASSWORD });
    await agent.get("/api/admin/stats").expect(403);

    expect(named("authz.denied").map((e) => e.reason)).toEqual(["no_session", "invalid_or_expired_session", "role"]);
    expect(named("authz.denied")[2]).toMatchObject({ role: "vendor", required: ["admin"] });
  });

  it("logs blocked cross-site requests (16.3.3)", async () => {
    await request(app).post("/api/auth/logout").set("Origin", "https://evil.example").expect(403);
    expect(named("csrf.blocked")[0]).toMatchObject({ outcome: "blocked", origin: "https://evil.example" });
  });

  it("logs rejected input (16.3.3)", async () => {
    await request(app).post("/api/auth/login").send({ email: "not-an-email", password: PASSWORD }).expect(400);
    expect(named("input.rejected")[0]).toMatchObject({ reason: "validation" });
  });

  it("audits admin changes with field names but not values", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "a@test.com", password: PASSWORD });
    await User.updateOne({ email: "a@test.com" }, { role: "admin" });
    await agent.post("/api/auth/login").send({ email: "a@test.com", password: PASSWORD });
    await agent.post("/api/admin/help/faqs").send({ question: "secret question?", answer: "x", category: "search" });

    const audit = named("admin.action")[0]!;
    expect(audit).toMatchObject({ route: "/api/admin/help/faqs", fields: ["question", "answer", "category"] });
    expect(JSON.stringify(audit)).not.toContain("secret question");
  });

  it("logs a request id with every entry", async () => {
    await request(app).get("/api/auth/me").expect(401);
    expect(events[0]!.requestId).toMatch(/^[0-9a-f]{32}$/);
  });
});
