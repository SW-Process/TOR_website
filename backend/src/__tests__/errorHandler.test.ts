import express from "express";
import request from "supertest";
import { errorHandler } from "../middleware/errorHandler";
import { httpError } from "../utils/httpError";
import { setSecurityLogSink } from "../utils/securityLog";

/** A throwaway app whose only route throws `err`, so the handler is tested on its own. */
function appThrowing(err: unknown) {
  const app = express();
  app.get("/boom", () => {
    throw err;
  });
  app.use(errorHandler);
  return app;
}

describe("errorHandler", () => {
  let logged: string[];
  beforeEach(() => {
    logged = [];
    setSecurityLogSink((line) => logged.push(line));
  });
  afterEach(() => setSecurityLogSink());

  it("hides the message of an unexpected error and logs it server-side", async () => {
    const res = await request(appThrowing(new Error("connect ECONNREFUSED 10.0.0.5:27017 /app/src/config/db.ts"))).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "Internal server error" });
    expect(JSON.stringify(res.body)).not.toContain("27017");
    // The details go to the server log only.
    expect(logged).toHaveLength(1);
    expect(JSON.parse(logged[0]!)).toMatchObject({ event: "error.unexpected", status: 500 });
    expect(logged[0]).toContain("27017");
  });

  it("hides the message of any 5xx, not only 500", async () => {
    const res = await request(appThrowing(httpError(502, "GCS bucket tor-checker-pdfs: permission denied"))).get("/boom");
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ message: "Internal server error" });
  });

  it("keeps the message of a deliberate 4xx so the client can act on it", async () => {
    const res = await request(appThrowing(httpError(400, "A valid email is required"))).get("/boom");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "A valid email is required" });
  });

  it("treats an out-of-range status as a 500", async () => {
    const res = await request(appThrowing(Object.assign(new Error("weird"), { status: 42 }))).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "Internal server error" });
  });
});
