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

describe("password policy on the auth routes (ASVS 6.2.4, 6.2.8)", () => {
  it("refuses to register with a common password", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "a@test.com", password: "Password1" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/too common/);
    expect(await User.countDocuments()).toBe(0);
  });

  it("refuses to register with a password bcrypt would truncate", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "a@test.com", password: "ก".repeat(25) });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/too long/);
  });

  it("refuses to change to a common password", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "b@test.com", password: "vendor-test-pass-17" }).expect(201);
    const res = await agent.put("/api/auth/password").send({ currentPassword: "vendor-test-pass-17", newPassword: "iloveyou1" });
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
