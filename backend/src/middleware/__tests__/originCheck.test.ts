import express from "express";
import request from "supertest";
import { originCheck } from "../originCheck";

const app = express();
app.use(originCheck);
app.post("/api/auth/logout-others", (_req, res) => {
  res.json({ ok: true });
});
app.post("/api/ingestion/capture", (_req, res) => {
  res.json({ ok: true });
});
app.get("/api/tors", (_req, res) => {
  res.json({ ok: true });
});

describe("originCheck (ASVS 3.5.1, 3.5.2)", () => {
  const previous = process.env.CLIENT_ORIGIN;
  beforeAll(() => {
    process.env.CLIENT_ORIGIN = "https://tor.example.com";
  });
  afterAll(() => {
    process.env.CLIENT_ORIGIN = previous;
  });

  it("lets our own frontend through", async () => {
    await request(app).post("/api/auth/logout-others").set("Origin", "https://tor.example.com").expect(200);
  });

  it("blocks a POST from another site, even one with no body", async () => {
    const res = await request(app).post("/api/auth/logout-others").set("Origin", "https://evil.example");
    expect(res.status).toBe(403);
  });

  it("blocks a cross-site request that sent no Origin", async () => {
    await request(app).post("/api/auth/logout-others").set("Sec-Fetch-Site", "cross-site").expect(403);
  });

  it("lets non-browser clients through (no Origin, no Sec-Fetch-Site)", async () => {
    await request(app).post("/api/auth/logout-others").expect(200);
  });

  it("never blocks safe methods", async () => {
    await request(app).get("/api/tors").set("Origin", "https://evil.example").expect(200);
  });

  it("lets the admin extension reach only its capture route", async () => {
    const ext = "chrome-extension://abcdefghijklmnop";
    await request(app).post("/api/ingestion/capture").set("Origin", ext).expect(200);
    await request(app).post("/api/auth/logout-others").set("Origin", ext).expect(403);
  });
});
