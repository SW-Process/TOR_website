import jwt from "jsonwebtoken";
import { signToken, verifyToken } from "../token";

describe("session token algorithm (ASVS 9.1.2)", () => {
  const user = { _id: "507f1f77bcf86cd799439011", role: "vendor" as const, tokenVersion: 0 };
  const secret = "test-secret-that-is-at-least-32-characters-long";
  let previous: string | undefined;

  beforeAll(() => {
    previous = process.env.JWT_SECRET;
    process.env.JWT_SECRET = secret;
  });
  afterAll(() => {
    process.env.JWT_SECRET = previous;
  });

  it("signs with HS256", () => {
    const header = jwt.decode(signToken(user), { complete: true })?.header;
    expect(header?.alg).toBe("HS256");
  });

  it("accepts its own tokens", () => {
    expect(verifyToken(signToken(user)).sub).toBe(user._id);
  });

  it("rejects an unsigned token (alg: none)", () => {
    const unsigned = jwt.sign({ role: "admin" }, "", { algorithm: "none", subject: user._id });
    expect(() => verifyToken(unsigned)).toThrow();
  });

  it("rejects a token signed with another HMAC algorithm", () => {
    const hs512 = jwt.sign({ role: "admin" }, secret, { algorithm: "HS512", subject: user._id });
    expect(() => verifyToken(hs512)).toThrow();
  });
});
