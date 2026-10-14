import { buildPasswordResetEmail } from "../passwordResetEmail";

describe("buildPasswordResetEmail", () => {
  const link = "http://localhost:3000/reset-password?token=abc123.def456";
  const email = buildPasswordResetEmail(link);

  it("carries the link in both the html button and the plain-text fallback", () => {
    expect(email.html).toContain(`href="${link}"`);
    expect(email.text).toContain(link);
  });

  it("is branded consistently with the site", () => {
    expect(email.subject).toContain("TOR Checker");
    expect(email.html).toContain("TOR Checker");
    expect(email.html).toContain("ตั้งรหัสผ่านใหม่");
  });

  it("is a full, self-contained HTML document with no external assets", () => {
    expect(email.html).toMatch(/^<!doctype html>/i);
    expect(email.html).not.toMatch(/<link|<script|url\(http/i);
  });
});
