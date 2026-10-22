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

async function signedIn() {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email: "avatar@test.com", password: "avatar-test-pass-1" }).expect(201);
  return agent;
}

describe("POST /api/auth/avatar content check (ASVS 5.2.2)", () => {
  it("rejects an HTML file uploaded as image/png", async () => {
    const agent = await signedIn();
    const html = Buffer.from("<html><script>alert(document.cookie)</script></html>");
    const res = await agent.post("/api/auth/avatar").attach("avatar", html, { filename: "me.png", contentType: "image/png" });
    expect(res.status).toBe(400);
    const user = await User.findOne({ email: "avatar@test.com" });
    expect(user?.avatarKey).toBeFalsy();
  });

  it("rejects an SVG uploaded as image/jpeg", async () => {
    const agent = await signedIn();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const res = await agent.post("/api/auth/avatar").attach("avatar", svg, { filename: "me.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(400);
  });
});
