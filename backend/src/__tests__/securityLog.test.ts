import request from "supertest";
import app from "../app";
import { maskEmail, securityLog, setSecurityLogSink } from "../utils/securityLog";

describe("security log (ASVS 16.2, 16.4.1)", () => {
  let lines: string[];
  beforeEach(() => {
    lines = [];
    setSecurityLogSink((line) => lines.push(line));
  });
  afterEach(() => setSecurityLogSink());

  it("writes one JSON line with when, what, who and outcome", () => {
    securityLog(null, { event: "auth.login", outcome: "failure", userId: "u1", reason: "bad_password" });
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]!);
    expect(entry).toMatchObject({
      logType: "security",
      event: "auth.login",
      outcome: "failure",
      severity: "WARNING",
      userId: "u1",
      reason: "bad_password",
    });
    expect(entry.time).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/); // UTC
  });

  it("keeps a newline in user input inside one entry (no log injection)", () => {
    securityLog(null, { event: "auth.login", outcome: "failure", email: "a\n{\"event\":\"forged\"}" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain("\n");
    expect(JSON.parse(lines[0]!).event).toBe("auth.login");
  });

  it("masks e-mail addresses", () => {
    expect(maskEmail("Kobkab@Gmail.com")).toBe("kob***@gmail.com");
    expect(maskEmail("a@b.co")).toBe("a***@b.co");
    expect(maskEmail("nonsense")).toBe("***");
  });

  it("clips very long details", () => {
    securityLog(null, { event: "x", outcome: "success", note: "y".repeat(5000) });
    expect(JSON.parse(lines[0]!).note.length).toBeLessThan(600);
  });

  it("never throws, even if the sink does", () => {
    setSecurityLogSink(() => {
      throw new Error("disk full");
    });
    expect(() => securityLog(null, { event: "x", outcome: "success" })).not.toThrow();
  });
});

describe("request id (ASVS 16.2.1)", () => {
  it("gives every response an X-Request-Id", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f]{32}$/);
  });

  it("reuses a well-formed Cloud Run trace id", async () => {
    const trace = "0123456789abcdef0123456789abcdef";
    const res = await request(app).get("/api/health").set("X-Cloud-Trace-Context", `${trace}/1;o=1`);
    expect(res.headers["x-request-id"]).toBe(trace);
  });

  it("ignores a malformed trace header", async () => {
    const res = await request(app).get("/api/health").set("X-Cloud-Trace-Context", "not-a-trace id; <script>");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f]{32}$/);
  });
});
