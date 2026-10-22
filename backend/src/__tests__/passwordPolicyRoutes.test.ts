import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";

import app from "../app";
import { User } from "../models";

let mongod: MongoMemoryServer;

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

describe("password policy on the auth routes (ASVS 6.2.4, 6.2.9, 6.2.11)", () => {
  it("refuses to register with a common password", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "a@test.com", password: "Password1" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/too common/);
    expect(await User.countDocuments()).toBe(0);
  });

  it("accepts a 64-character Thai password and signs in with it (ASVS 6.2.9)", async () => {
    const password = "ก".repeat(64); // 192 bytes, past bcrypt's 72
    await request(app).post("/api/auth/register").send({ email: "a@test.com", password }).expect(201);
    await request(app).post("/api/auth/login").send({ email: "a@test.com", password }).expect(200);
    // a different password with the same first 72 bytes must not work
    await request(app).post("/api/auth/login").send({ email: "a@test.com", password: "ก".repeat(63) + "ข" }).expect(401);
  });

  it("refuses a password over 128 characters", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "a@test.com", password: "q9".repeat(65) });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/too long/);
  });

  it("upgrades a legacy bcrypt hash at the next sign-in", async () => {
    const bcrypt = await import("bcrypt");
    const { User } = await import("../models");
    await User.collection.insertOne({
      email: "old@test.com",
      role: "vendor",
      tokenVersion: 0,
      passwordHash: await bcrypt.hash("plum-orchard-ladder-17", 4),
    });
    await request(app).post("/api/auth/login").send({ email: "old@test.com", password: "plum-orchard-ladder-17" }).expect(200);
    const after = await User.findOne({ email: "old@test.com" }).select("+passwordHash").lean();
    expect(after!.passwordHash!.startsWith("v2$")).toBe(true);
    await request(app).post("/api/auth/login").send({ email: "old@test.com", password: "plum-orchard-ladder-17" }).expect(200);
  });

  it("refuses a password made of words specific to this site (ASVS 6.2.11)", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "c@test.com", password: "TorChecker-Bangkok-2026" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/too easy to guess/);
  });

  it("refuses to change to a common password", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "b@test.com", password: "plum-orchard-ladder-17" }).expect(201);
    const res = await agent.put("/api/auth/password").send({ currentPassword: "plum-orchard-ladder-17", newPassword: "iloveyou1" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/too common/);
  });

  it("does not let a longer password log in to a 72-byte one", async () => {
    const exact = "x".repeat(72);
    await request(app).post("/api/auth/register").send({ email: "c@test.com", password: exact }).expect(201);
    await request(app).post("/api/auth/login").send({ email: "c@test.com", password: exact }).expect(200);
    await request(app).post("/api/auth/login").send({ email: "c@test.com", password: `${exact}extra` }).expect(401);
  });
});
