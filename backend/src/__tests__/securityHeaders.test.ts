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
});
