import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";

import app from "../app";
import { Tor } from "../models";

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

describe("GET /api/tors/:id — procurement", () => {
  it("returns procurement but never the internal storageKey of an announcement", async () => {
    const tor = await Tor.create({
      title: "ระบบ",
      pipelineStatus: "enriched",
      procurement: {
        stage: "inviting",
        contractStatus: "ระหว่างดำเนินการ",
        announcements: [
          {
            announcementId: "a-1",
            typeName: "ประกาศเชิญชวน",
            kind: "invitation",
            publishedAt: new Date("2026-09-10T00:00:00Z"),
            hasFile: true,
            storageKey: "tor-pdfs/1/a-1.pdf",
          },
        ],
        source: "gproc",
        deadlineAttempt: { announcementId: "a-1", at: new Date("2026-10-03T00:00:00Z"), outcome: "read" },
        lastCheckedAt: new Date("2026-10-03T00:00:00Z"),
      },
    });

    const res = await request(app).get(`/api/tors/${tor.id}`);

    expect(res.status).toBe(200);
    expect(res.body.tor.procurement.stage).toBe("inviting");
    expect(res.body.tor.procurement.announcements[0]).toMatchObject({ kind: "invitation", hasFile: true });
    expect(res.body.tor.procurement.announcements[0]).not.toHaveProperty("storageKey");
    expect(res.body.tor.procurement).not.toHaveProperty("deadlineAttempt");
    expect(res.body.tor.procurement).not.toHaveProperty("source");
    expect(JSON.stringify(res.body)).not.toContain("tor-pdfs/1/a-1.pdf");
  });
});
