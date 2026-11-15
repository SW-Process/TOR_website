import request from "supertest";

process.env.JWT_SECRET = "test-secret";
process.env.RATE_LIMIT_ENABLED = "true";

import app from "../app";
import { API_LIMIT_PER_MINUTE } from "../middleware/apiRateLimit";

afterAll(() => {
  delete process.env.RATE_LIMIT_ENABLED;
});

// Fixes for the CodeQL findings: ReDoS in the email check, and no rate limit on some routes.

describe("email check (CodeQL js/polynomial-redos)", () => {
  it("rejects a long crafted email quickly instead of hanging", async () => {
    const evil = "a@" + "!.".repeat(40_000) + " ";
    const started = Date.now();
    const res = await request(app).post("/api/auth/forgot-password").send({ email: evil });
    expect(res.status).toBe(400);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("rejects an address with an empty domain label", async () => {
    await request(app).post("/api/auth/forgot-password").send({ email: "a@b..com" }).expect(400);
  });
});

describe("global API rate limit (threat T19, CodeQL js/missing-rate-limiting)", () => {
  it(`answers 429 after ${API_LIMIT_PER_MINUTE} requests from one IP in a minute`, async () => {
    for (let i = 0; i < API_LIMIT_PER_MINUTE - 3; i++) {
      await request(app).get("/api/health").expect(200);
    }
    // The two requests in the email tests above count too.
    const last = await request(app).get("/api/health");
    expect(last.status).toBe(200);
    expect(last.headers["ratelimit-limit"]).toBe(String(API_LIMIT_PER_MINUTE));
    const blocked = await request(app).get("/api/health");
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBeDefined();
  });
});
