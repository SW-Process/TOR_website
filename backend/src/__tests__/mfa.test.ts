import crypto from "node:crypto";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";

import app from "../app";
import { Session, User } from "../models";
import { base32Decode, currentStep, totpAt } from "../utils/totp";

let mongod: MongoMemoryServer;
const PASSWORD = "vendor-test-pass-17";
const EMAIL = "vendor@test.com";

/** Move the clock forward so a new TOTP step (and so a new code) comes up. */
let offset = 0;
const realNow = Date.now.bind(Date);
const advance = (ms: number) => {
  offset += ms;
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

beforeEach(() => {
  offset = 0;
  jest.spyOn(Date, "now").mockImplementation(() => realNow() + offset);
  process.env.ADMIN_MFA_REQUIRED = "false";
});

afterEach(async () => {
  jest.restoreAllMocks();
  await Promise.all([User.deleteMany({}), Session.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const codeFor = (secret: string) => totpAt(base32Decode(secret), currentStep(Date.now()));

/** Register, set up MFA and return the agent, the seed and the recovery codes. */
async function enrolled(email = EMAIL) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email, password: PASSWORD }).expect(201);
  const setup = await agent.post("/api/auth/mfa/setup").expect(200);
  const enable = await agent.post("/api/auth/mfa/enable").send({ code: codeFor(setup.body.secret) }).expect(200);
  return { agent, secret: setup.body.secret as string, recoveryCodes: enable.body.recoveryCodes as string[] };
}

describe("setting up two-step verification", () => {
  it("shows a seed and QR code, then switches on after a correct code", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: EMAIL, password: PASSWORD }).expect(201);
    const setup = await agent.post("/api/auth/mfa/setup").expect(200);
    expect(setup.body.secret).toMatch(/^[A-Z2-7]{32}$/); // 160 bits
    expect(setup.body.otpauthUrl).toContain("otpauth://totp/");
    expect(setup.body.qrSvg).toContain("<svg");

    await agent.post("/api/auth/mfa/enable").send({ code: "000000" }).expect(400);
    const res = await agent.post("/api/auth/mfa/enable").send({ code: codeFor(setup.body.secret) }).expect(200);
    expect(res.body.recoveryCodes).toHaveLength(10);
    expect(res.body.recoveryCodes[0]).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
    expect(res.body.user).toMatchObject({ mfaEnabled: true, recoveryCodesLeft: 10, sessionMfa: true });
  });

  it("stores the seed encrypted and the recovery codes hashed", async () => {
    const { secret, recoveryCodes } = await enrolled();
    const user = await User.findOne({ email: EMAIL }).select("+mfaSecretEnc +mfaRecoveryCodes").lean();
    expect(user!.mfaSecretEnc).toMatch(/^v1:/);
    expect(JSON.stringify(user)).not.toContain(secret);
    expect(JSON.stringify(user)).not.toContain(recoveryCodes[0]!.replace("-", ""));
    expect(user!.mfaRecoveryCodes[0]!.hash).toMatch(/^\$2[aby]\$10\$/);
  });

  it("never sends the MFA fields in account JSON", async () => {
    const { agent } = await enrolled();
    const me = await agent.get("/api/auth/me").expect(200);
    expect(JSON.stringify(me.body)).not.toMatch(/mfaSecretEnc|mfaRecoveryCodes|mfaLastStep|mfaPending/);
  });

  it("needs a recent sign-in or re-authentication to start", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: EMAIL, password: PASSWORD }).expect(201);
    await Session.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - 60 * 60_000) } });
    expect((await agent.post("/api/auth/mfa/setup").expect(401)).body.code).toBe("reauth_required");
  });
});

describe("signing in with two-step verification", () => {
  it("asks for a code after the password, and only then starts a session", async () => {
    const { secret } = await enrolled();
    advance(30_000);
    const device = request.agent(app);
    const first = await device.post("/api/auth/login").send({ email: EMAIL, password: PASSWORD }).expect(200);
    expect(first.body).toEqual({ mfaRequired: true });
    await device.get("/api/auth/me").expect(401); // no session yet

    expect((await device.post("/api/auth/mfa/verify").send({ code: "123456" }).expect(401)).body.code).toBe("bad_code");
    const ok = await device.post("/api/auth/mfa/verify").send({ code: codeFor(secret) }).expect(200);
    expect(ok.body.user).toMatchObject({ email: EMAIL, sessionMfa: true });
    await device.get("/api/auth/me").expect(200);
    const session = await Session.findOne({}).sort({ createdAt: -1 }).lean();
    expect(session!.mfa).toBe(true);
  });

  it("accepts each code once (ASVS 6.5.1)", async () => {
    const { secret } = await enrolled();
    advance(30_000);
    const code = codeFor(secret);
    const a = request.agent(app);
    await a.post("/api/auth/login").send({ email: EMAIL, password: PASSWORD });
    await a.post("/api/auth/mfa/verify").send({ code }).expect(200);

    const b = request.agent(app);
    await b.post("/api/auth/login").send({ email: EMAIL, password: PASSWORD });
    await b.post("/api/auth/mfa/verify").send({ code }).expect(401);
  });

  it("refuses the code step without a fresh password step", async () => {
    const { secret } = await enrolled();
    advance(30_000);
    const res = await request(app).post("/api/auth/mfa/verify").send({ code: codeFor(secret) }).expect(401);
    expect(res.body.code).toBe("mfa_expired");
  });

  it("expires the password step after 5 minutes", async () => {
    const { secret } = await enrolled();
    const device = request.agent(app);
    await device.post("/api/auth/login").send({ email: EMAIL, password: PASSWORD });
    advance(6 * 60_000);
    expect((await device.post("/api/auth/mfa/verify").send({ code: codeFor(secret) }).expect(401)).body.code).toBe("mfa_expired");
  });

  it("makes the password be entered again after 5 wrong codes", async () => {
    const { secret } = await enrolled();
    advance(30_000);
    const device = request.agent(app);
    await device.post("/api/auth/login").send({ email: EMAIL, password: PASSWORD });
    for (let i = 0; i < 5; i++) await device.post("/api/auth/mfa/verify").send({ code: "000000" }).expect(401);
    expect((await device.post("/api/auth/mfa/verify").send({ code: codeFor(secret) }).expect(401)).body.code).toBe("mfa_expired");
  });

  it("lets a recovery code stand in for the app, once", async () => {
    const { recoveryCodes } = await enrolled();
    const a = request.agent(app);
    await a.post("/api/auth/login").send({ email: EMAIL, password: PASSWORD });
    const res = await a.post("/api/auth/mfa/verify").send({ code: recoveryCodes[3]!.toLowerCase() }).expect(200);
    expect(res.body.user.recoveryCodesLeft).toBe(9);

    const b = request.agent(app);
    await b.post("/api/auth/login").send({ email: EMAIL, password: PASSWORD });
    await b.post("/api/auth/mfa/verify").send({ code: recoveryCodes[3] }).expect(401);
  });

  it("fails closed when the stored seed won't decrypt (ASVS 16.5.3)", async () => {
    const { secret } = await enrolled();
    await User.updateOne({ email: EMAIL }, { mfaSecretEnc: "v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:AAAA" });
    advance(30_000);
    const device = request.agent(app);
    await device.post("/api/auth/login").send({ email: EMAIL, password: PASSWORD });
    const res = await device.post("/api/auth/mfa/verify").send({ code: codeFor(secret) });
    expect(res.status).toBe(401); // a wrong code, not a 500 or a way in
    expect(res.body.code).toBe("bad_code");
  });

  it("isn't bypassed by resetting the password (ASVS 6.4.3)", async () => {
    await enrolled();
    const user = (await User.findOne({ email: EMAIL }))!;
    const raw = crypto.randomBytes(32).toString("hex");
    await User.updateOne(
      { _id: user._id },
      { resetPasswordTokenHash: crypto.createHash("sha256").update(raw).digest("hex"), resetPasswordExpiresAt: new Date(Date.now() + 60_000) }
    );
    const device = request.agent(app);
    await device.post("/api/auth/reset-password").send({ token: `${user.id}.${raw}`, password: "a-brand-new-pass-29" }).expect(200);
    await device.get("/api/auth/me").expect(401); // resetting doesn't sign in
    const login = await device.post("/api/auth/login").send({ email: EMAIL, password: "a-brand-new-pass-29" }).expect(200);
    expect(login.body.mfaRequired).toBe(true);
  });
});

describe("re-authentication and turning it off", () => {
  it("asks for the password and a code", async () => {
    const { agent, secret } = await enrolled();
    await Session.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - 60 * 60_000), reauthAt: null } });
    const res = await agent.post("/api/auth/logout-others").expect(401);
    expect(res.body.methods).toEqual(["password", "totp"]);

    await agent.post("/api/auth/reauth").send({ currentPassword: PASSWORD }).expect(401);
    advance(30_000);
    await agent.post("/api/auth/reauth").send({ currentPassword: PASSWORD, mfaCode: codeFor(secret) }).expect(200);
    await agent.post("/api/auth/logout-others").expect(200);
  });

  it("turns off, after which a password is enough again", async () => {
    const { agent } = await enrolled();
    const res = await agent.post("/api/auth/mfa/disable").expect(200);
    expect(res.body.user.mfaEnabled).toBe(false);
    const login = await request(app).post("/api/auth/login").send({ email: EMAIL, password: PASSWORD }).expect(200);
    expect(login.body.user).toBeDefined();
  });

  it("issues a fresh set of recovery codes and voids the old ones", async () => {
    const { agent, recoveryCodes } = await enrolled();
    const res = await agent.post("/api/auth/mfa/recovery-codes").expect(200);
    expect(res.body.recoveryCodes).toHaveLength(10);
    const device = request.agent(app);
    await device.post("/api/auth/login").send({ email: EMAIL, password: PASSWORD });
    await device.post("/api/auth/mfa/verify").send({ code: recoveryCodes[0] }).expect(401);
  });
});
