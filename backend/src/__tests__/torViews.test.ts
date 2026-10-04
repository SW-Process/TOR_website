import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";

import app from "../app";
import { Tor, type TorPipelineStatus } from "../models";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Tor.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function seedTor(pipelineStatus: TorPipelineStatus = "enriched") {
  return String((await Tor.create({ title: "ระบบสารบรรณ", pipelineStatus }))._id);
}

describe("POST /api/tors/:id/view", () => {
  it("counts a view without a session", async () => {
    const id = await seedTor();
    await request(app).post(`/api/tors/${id}/view`).expect(204);
    await request(app).post(`/api/tors/${id}/view`).expect(204);
    expect((await Tor.findById(id).lean())!.viewCount).toBe(2);
  });

  it("counts every view of a burst, none lost", async () => {
    const id = await seedTor();
    await Promise.all(Array.from({ length: 10 }, () => request(app).post(`/api/tors/${id}/view`)));
    expect((await Tor.findById(id).lean())!.viewCount).toBe(10);
  });

  it("404s for a TOR that is not public and leaves its count alone", async () => {
    const id = await seedTor("pending");
    await request(app).post(`/api/tors/${id}/view`).expect(404);
    expect((await Tor.findById(id).lean())!.viewCount).toBe(0);
  });

  it("400s for a malformed id", async () => {
    await request(app).post("/api/tors/not-an-id/view").expect(400);
  });

  it("shows the count in the list and on the detail", async () => {
    const id = await seedTor();
    await request(app).post(`/api/tors/${id}/view`).expect(204);
    expect((await request(app).get("/api/tors")).body.data[0].viewCount).toBe(1);
    expect((await request(app).get(`/api/tors/${id}`)).body.tor.viewCount).toBe(1);
  });

  it("is not counted by reading the TOR", async () => {
    const id = await seedTor();
    await request(app).get(`/api/tors/${id}`).expect(200);
    await request(app).get("/api/tors").expect(200);
    expect((await Tor.findById(id).lean())!.viewCount).toBe(0);
  });
});
