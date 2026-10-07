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

  it("returns a process5 original link for a gproc TOR and the stored egp2 link otherwise, never procurement.source", async () => {
    const egp2Url = "https://egp2.bangkok.go.th/project/222";
    const gproc = await Tor.create({
      title: "gproc",
      projectCode: "69099312832",
      pipelineStatus: "enriched",
      sourceListingUrl: "https://egp2.bangkok.go.th/project/111",
      procurement: { stage: "inviting", announcements: [], source: "gproc", lastCheckedAt: new Date("2026-10-03T00:00:00Z") },
    });
    const egp2 = await Tor.create({
      title: "egp2",
      projectCode: "69099312833",
      pipelineStatus: "enriched",
      sourceListingUrl: egp2Url,
      procurement: { stage: "inviting", announcements: [], source: "egp2", lastCheckedAt: new Date("2026-10-03T00:00:00Z") },
    });
    const bare = await Tor.create({
      title: "gproc no url",
      projectCode: "69099312834",
      pipelineStatus: "enriched",
      procurement: { stage: "inviting", announcements: [], source: "gproc", lastCheckedAt: new Date("2026-10-03T00:00:00Z") },
    });

    const g = await request(app).get(`/api/tors/${gproc.id}`);
    const e = await request(app).get(`/api/tors/${egp2.id}`);
    const b = await request(app).get(`/api/tors/${bare.id}`);

    expect(g.body.tor.sourceListingUrl).toBe("https://process5.gprocurement.go.th/egp-agpc01-web/announcement?keywordSearch=69099312832");
    expect(e.body.tor.sourceListingUrl).toBe(egp2Url);
    expect(b.body.tor.sourceListingUrl).toBe("https://process5.gprocurement.go.th/egp-agpc01-web/announcement?keywordSearch=69099312834");
    for (const r of [g, e, b]) expect(r.body.tor.procurement.source).toBeUndefined();
  });
});
