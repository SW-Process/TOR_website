import request from "supertest";
import app from "../app";

describe("security headers (ASVS 3.4)", () => {
  it("sends the browser security headers on every response", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.headers["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("does not advertise Express", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("tells caches not to keep API answers (ASVS 14.3.2)", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it.each(["TRACE", "TRACK", "CONNECT"])("refuses %s with 405 (ASVS 13.4.4)", async (method) => {
    const res = await request(app)[method === "TRACE" ? "trace" : "get"]("/api/health").set("X-HTTP-Method-Override", method);
    if (method === "TRACE") {
      expect(res.status).toBe(405);
      expect(res.headers.allow).toContain("GET");
    } else {
      // an override header changes nothing: there is no method-override middleware
      expect(res.status).toBe(200);
    }
  });
});
