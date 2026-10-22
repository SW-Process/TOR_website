import { base32Decode, base32Encode, currentStep, matchTotp, otpauthUri, totpAt } from "../totp";
import { open, seal } from "../secretBox";

describe("TOTP (RFC 6238)", () => {
  // Appendix B test vectors, SHA-1, 8 digits, secret "12345678901234567890".
  const secret = Buffer.from("12345678901234567890");
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])("time %i gives %s", (seconds, expected) => {
    expect(totpAt(secret, Math.floor(seconds / 30), 8)).toBe(expected);
  });

  it("accepts only the current 30-second step (ASVS 6.5.5)", () => {
    const now = 1_700_000_015_000;
    const step = currentStep(now);
    expect(matchTotp(secret, totpAt(secret, step), now)).toBe(step);
    expect(matchTotp(secret, totpAt(secret, step - 1), now)).toBeNull();
    expect(matchTotp(secret, totpAt(secret, step + 1), now)).toBeNull();
  });

  it("rejects anything that is not 6 digits", () => {
    expect(matchTotp(secret, "12345")).toBeNull();
    expect(matchTotp(secret, "abcdef")).toBeNull();
  });

  it("round-trips base32 and builds the otpauth URI", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Decode("MZXW6YTBOI").toString()).toBe("foobar");
    const uri = otpauthUri(secret, "a@b.co", "TOR Checker");
    expect(uri).toMatch(/^otpauth:\/\/totp\/TOR%20Checker%3Aa%40b\.co\?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=TOR\+Checker/);
  });
});

describe("secretBox (AES-256-GCM)", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "test-secret";
  });

  it("decrypts what it sealed, only with the same associated data", () => {
    const sealed = seal(Buffer.from("seed"), "user-1");
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(open(sealed, "user-1").toString()).toBe("seed");
    expect(() => open(sealed, "user-2")).toThrow();
  });

  it("detects tampering (ASVS 11.3.3)", () => {
    const parts = seal(Buffer.from("seed"), "u").split(":");
    const flipped = Buffer.from(parts[3]!, "base64url");
    flipped[0] = flipped[0]! ^ 1;
    parts[3] = flipped.toString("base64url");
    expect(() => open(parts.join(":"), "u")).toThrow();
  });

  it("uses a fresh IV every time", () => {
    expect(seal(Buffer.from("x"))).not.toBe(seal(Buffer.from("x")));
  });
});
