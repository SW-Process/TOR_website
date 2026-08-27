const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";

const app = require("../app");
const { User } = require("../models");

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await User.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const creds = { email: "vendor@test.com", password: "secret123" };

describe("POST /api/auth/register", () => {
  it("creates a vendor, sets an HttpOnly cookie, and hides the hash", async () => {
    const res = await request(app).post("/api/auth/register").send(creds);

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(creds.email);
    expect(res.body.user.role).toBe("vendor");
    expect(res.body.user).not.toHaveProperty("passwordHash");

    const cookie = res.headers["set-cookie"][0];
    expect(cookie).toMatch(/token=/);
    expect(cookie).toMatch(/HttpOnly/i);

    const stored = await User.findOne({ email: creds.email }).select("+passwordHash");
    expect(stored.passwordHash).not.toBe(creds.password);
  });

  it("rejects a duplicate email with 409", async () => {
    await request(app).post("/api/auth/register").send(creds);
    const res = await request(app).post("/api/auth/register").send(creds);
    expect(res.status).toBe(409);
  });

  it("rejects a short password with 400", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: creds.email, password: "short" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await request(app).post("/api/auth/register").send(creds);
  });

  it("returns 200 and a session for valid credentials", async () => {
    const res = await request(app).post("/api/auth/login").send(creds);
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"][0]).toMatch(/token=/);
  });

  it("returns 401 for a wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ ...creds, password: "wrongpass1" });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 without a session cookie", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the current user with a valid cookie", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(creds);
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(creds.email);
  });
});
