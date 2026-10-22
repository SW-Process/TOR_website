import express from "express";
import request from "supertest";
import { rateLimit } from "../rateLimit";

function appWith(limiter: express.RequestHandler) {
  const app = express();
  app.use(express.json());
  app.post("/x", limiter, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe("rateLimit (ASVS 6.3.1)", () => {
  const previous = process.env.RATE_LIMIT_ENABLED;
  beforeAll(() => {
    process.env.RATE_LIMIT_ENABLED = "true";
  });
  afterAll(() => {
    process.env.RATE_LIMIT_ENABLED = previous;
  });

  it("allows up to max requests, then answers 429 with Retry-After", async () => {
    const app = appWith(rateLimit({ windowMs: 60_000, max: 2 }));
    await request(app).post("/x").expect(200);
    const second = await request(app).post("/x").expect(200);
    expect(second.headers["ratelimit-remaining"]).toBe("0");
    const third = await request(app).post("/x").expect(429);
    expect(Number(third.headers["retry-after"])).toBeGreaterThan(0);
    expect(third.body.message).toMatch(/too many/i);
  });

  it("counts each key separately", async () => {
    const app = appWith(rateLimit({ windowMs: 60_000, max: 1, key: (req) => String(req.body.email) }));
    await request(app).post("/x").send({ email: "a@test.com" }).expect(200);
    await request(app).post("/x").send({ email: "a@test.com" }).expect(429);
    await request(app).post("/x").send({ email: "b@test.com" }).expect(200);
  });

  it("starts a new window once the old one ends", async () => {
    const app = appWith(rateLimit({ windowMs: 50, max: 1 }));
    await request(app).post("/x").expect(200);
    await request(app).post("/x").expect(429);
    await new Promise((r) => setTimeout(r, 80));
    await request(app).post("/x").expect(200);
  });

  it("does nothing when switched off", async () => {
    process.env.RATE_LIMIT_ENABLED = "false";
    const app = appWith(rateLimit({ windowMs: 60_000, max: 1 }));
    await request(app).post("/x").expect(200);
    await request(app).post("/x").expect(200);
    process.env.RATE_LIMIT_ENABLED = "true";
  });
});
