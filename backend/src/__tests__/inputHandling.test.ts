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

afterAll(async () => {
  await User.deleteMany({});
  await mongoose.disconnect();
  await mongod.stop();
});

describe("parameter pollution and type confusion (ASVS 15.3.5, 15.3.7)", () => {
  it("refuses a single-valued query parameter sent twice", async () => {
    const res = await request(app).get("/api/tors?q=one&q=two");
    expect(res.status).toBe(400);
  });

  it("treats a repeated list parameter as a list", async () => {
    await request(app).get("/api/tors?status=open&status=closed").expect(200);
  });

  it("keeps query brackets as plain names, never objects or operators", async () => {
    // Express 5's "simple" query parser: `budgetMin[$gt]` is just an unknown name, ignored.
    const res = await request(app).get("/api/tors?budgetMin[$gt]=0&budgetMin=abc");
    expect(res.status).toBe(400); // the real budgetMin is still validated as a number
    await request(app).get("/api/tors?budgetMin[$gt]=0").expect(200);
  });

  it("refuses an operator object where an email is expected", async () => {
    await User.create({ email: "v@test.com", role: "vendor", password: "plum-orchard-ladder-17" } as never);
    const res = await request(app).post("/api/auth/login").send({ email: { $gt: "" }, password: { $gt: "" } });
    expect(res.status).toBe(400);
  });

  it("refuses an oversized JSON body", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ email: "a@b.co", password: "x".repeat(200 * 1024) }));
    expect(res.status).toBe(413);
  });
});
