import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.RATE_LIMIT_ENABLED = "true";

import app from "../app";
import { User } from "../models";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await User.deleteMany({});
  await mongoose.disconnect();
  await mongod.stop();
  delete process.env.RATE_LIMIT_ENABLED;
});

describe("POST /api/auth/login brute force (ASVS 6.3.1)", () => {
  it("blocks the 11th wrong password for the same email within 15 minutes", async () => {
    const attempt = { email: "victim@test.com", password: "wrong-password-1" };
    for (let i = 0; i < 10; i++) {
      await request(app).post("/api/auth/login").send(attempt).expect(401);
    }
    const blocked = await request(app).post("/api/auth/login").send(attempt);
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("still lets the same IP try a different account", async () => {
    await request(app).post("/api/auth/login").send({ email: "other@test.com", password: "wrong-password-1" }).expect(401);
  });
});
