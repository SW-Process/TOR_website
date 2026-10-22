import { MAX_PASSWORD_LENGTH, newPasswordProblem, passwordProblem } from "../passwordPolicy";
import { setBreachFetch } from "../breachedPasswords";
import { createHash } from "node:crypto";

describe("passwordProblem (ASVS 6.2.1, 6.2.4, 6.2.5, 6.2.9)", () => {
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

  it("allows passwords of 64 characters and more (ASVS 6.2.9), up to 128", () => {
    expect(passwordProblem("a long passphrase ".repeat(4) + "x".repeat(10))).toBeNull(); // 82 characters
    expect(passwordProblem("ก".repeat(64))).toBeNull(); // 192 bytes: fine now that we pre-hash
    expect(passwordProblem("q9".repeat(MAX_PASSWORD_LENGTH / 2))).toBeNull();
    expect(passwordProblem("q9".repeat(MAX_PASSWORD_LENGTH / 2) + "z")).toMatch(/too long/);
  });
});

describe("context-specific words (ASVS 6.2.11)", () => {
  it.each(["TorChecker2026!", "t0rch3ck3r", "bangkok-procurement", "กรุงเทพ12345", "egp-vendor-99", "Password-Bangkok"])("refuses %s", (pw) => {
    expect(passwordProblem(pw)).toMatch(/too easy to guess/);
  });

  it("refuses the user's own email name or display name", () => {
    expect(passwordProblem("kobkab-2026-x", { email: "kobkab@gmail.com" })).toMatch(/name or email/);
    expect(passwordProblem("xx-somchai-77", { displayName: "Somchai" })).toMatch(/name or email/);
  });

  it("still allows passwords that only contain such a word among others", () => {
    expect(passwordProblem("my tor checker is on a blue bicycle")).toBeNull();
    expect(passwordProblem("vendor-test-pass-17")).toBeNull();
  });
});

describe("breached passwords (ASVS 6.2.12)", () => {
  const sha1 = (pw: string) => createHash("sha1").update(pw).digest("hex").toUpperCase();
  let calls: string[];
  beforeEach(() => {
    calls = [];
    process.env.BREACHED_PASSWORD_CHECK = "true";
  });
  afterEach(() => {
    process.env.BREACHED_PASSWORD_CHECK = "false";
    setBreachFetch();
  });

  it("sends only the first 5 characters of the SHA-1 and matches the rest here", async () => {
    const pw = "a-leaked-but-long-one";
    const hash = sha1(pw);
    setBreachFetch(async (url, init) => {
      calls.push(url);
      expect(new Headers(init.headers).get("Add-Padding")).toBe("true");
      return new Response(`0000000000000000000000000000000000A:0\r\n${hash.slice(5)}:42\r\n`);
    });
    expect(await newPasswordProblem(pw)).toMatch(/data breach/);
    expect(calls).toEqual([`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`]);
    expect(calls[0]).not.toContain(hash.slice(5));
  });

  it("ignores padding rows and passes a password that isn't listed", async () => {
    const pw = "not-in-any-breach-2026";
    setBreachFetch(async () => new Response(`${sha1(pw).slice(5)}:0\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:3\n`));
    expect(await newPasswordProblem(pw)).toBeNull();
  });

  it("accepts the password when the service is down (fail open)", async () => {
    setBreachFetch(async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(await newPasswordProblem("service-is-down-pass")).toBeNull();
  });

  it("doesn't call out for a password the local rules already refuse", async () => {
    setBreachFetch(async (url) => {
      calls.push(url);
      return new Response("");
    });
    expect(await newPasswordProblem("password")).toMatch(/too common/);
    expect(calls).toHaveLength(0);
  });
});
