import { MAX_PASSWORD_BYTES, passwordProblem } from "../passwordPolicy";

describe("passwordProblem (ASVS 6.2.1, 6.2.4, 6.2.5, 6.2.8)", () => {
  it("accepts a long, uncommon password of any composition", () => {
    expect(passwordProblem("correct horse battery staple")).toBeNull();
    expect(passwordProblem("ทดสอบรหัสผ่าน")).toBeNull();
    expect(passwordProblem("alllowercaseletters")).toBeNull();
  });

  it("rejects passwords shorter than 8 characters", () => {
    expect(passwordProblem("short1")).toMatch(/at least 8/);
    expect(passwordProblem(undefined)).toMatch(/at least 8/);
  });

  it("rejects common passwords, ignoring case", () => {
    expect(passwordProblem("password")).toMatch(/too common/);
    expect(passwordProblem("PassWord1")).toMatch(/too common/);
    expect(passwordProblem("12345678")).toMatch(/too common/);
    expect(passwordProblem("qwertyuiop")).toMatch(/too common/);
  });

  it("refuses passwords bcrypt would truncate", () => {
    expect(passwordProblem("a".repeat(MAX_PASSWORD_BYTES))).toBeNull();
    expect(passwordProblem("a".repeat(MAX_PASSWORD_BYTES + 1))).toMatch(/too long/);
    // 25 Thai characters = 75 bytes in UTF-8
    expect(passwordProblem("ก".repeat(25))).toMatch(/too long/);
  });
});
