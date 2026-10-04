import type { AnnouncementKind, IProcurement } from "../../models/Tor";
import type { EgpAnnouncement } from "../../scraper/egpClient.types";
import { buildProcurement, classifyAnnouncement, deriveStage, mergeProcurement } from "../procurementStage";

describe("classifyAnnouncement", () => {
  it.each([
    ["ร่างขอบเขตของงาน (TOR)", "tor-draft"],
    ["ร่างเอกสารประกวดราคา (e-Bidding) และร่างเอกสารซื้อหรือจ้างด้วยวิธีสอบราคา", "bidding-draft"],
    ["ประกาศราคากลาง", "reference-price"],
    ["ประกาศเชิญชวน", "invitation"],
    ["ยกเลิกประกาศเชิญชวน", "cancellation"],
    ["ประกาศรายชื่อผู้ชนะการเสนอราคา / ประกาศรายชื่อผู้ได้รับการคัดเลือก", "winner"],
    ["แผนการจัดซื้อจัดจ้าง", "plan"],
    ["ไม่ระบุ", "unknown"],
    ["  ", "unknown"],
    [null, "unknown"],
    [undefined, "unknown"],
    ["ประกาศอื่นที่ไม่เคยเห็น", "unknown"],
  ] as [string | null | undefined, AnnouncementKind][])("%p → %s", (name, kind) => {
    expect(classifyAnnouncement(name)).toBe(kind);
  });

  it("tolerates surrounding whitespace", () => {
    expect(classifyAnnouncement("  ประกาศเชิญชวน ")).toBe("invitation");
  });
});

const at = (day: number) => new Date(Date.UTC(2026, 8, day));
const a = (kind: AnnouncementKind, day?: number) => ({
  kind,
  publishedAt: day === undefined ? undefined : at(day),
});

describe("deriveStage", () => {
  it("is draft with only drafts, a reference price or a plan", () => {
    expect(deriveStage([a("tor-draft", 1)], null)).toBe("draft");
    expect(deriveStage([a("tor-draft", 1), a("bidding-draft", 2), a("reference-price", 3)], null)).toBe("draft");
    expect(deriveStage([a("plan", 1)], null)).toBe("draft");
    expect(deriveStage([], null)).toBe("draft");
  });

  it("is inviting once an invitation exists and nothing later settles it", () => {
    expect(deriveStage([a("tor-draft", 1), a("invitation", 2)], "ระหว่างดำเนินการ")).toBe("inviting");
  });

  it("is awarded when a winner announcement exists, with or without an invitation", () => {
    expect(deriveStage([a("tor-draft", 1), a("invitation", 2), a("winner", 3)], null)).toBe("awarded");
    expect(deriveStage([a("winner", 3)], null)).toBe("awarded");
  });

  it("is cancelled when a cancellation is the latest invitation-related announcement", () => {
    expect(deriveStage([a("bidding-draft", 1), a("invitation", 2), a("cancellation", 3)], null)).toBe("cancelled");
  });

  it("is inviting again when re-invited after a cancellation", () => {
    expect(deriveStage([a("invitation", 1), a("cancellation", 2), a("invitation", 3)], null)).toBe("inviting");
  });

  it("treats a cancellation and invitation with the same timestamp as still inviting, in either order", () => {
    expect(deriveStage([a("cancellation", 2), a("invitation", 2)], null)).toBe("inviting");
    expect(deriveStage([a("invitation", 2), a("cancellation", 2)], null)).toBe("inviting");
  });

  it("lets a contract status of ยกเลิกโครงการ override everything, ignoring whitespace", () => {
    expect(deriveStage([a("winner", 3)], "ยกเลิกโครงการ")).toBe("cancelled");
    expect(deriveStage([a("invitation", 2)], "  ยกเลิกโครงการ ")).toBe("cancelled");
  });

  it("ignores unknown announcements and tolerates missing dates", () => {
    expect(deriveStage([a("unknown"), a("unknown", 5)], null)).toBe("draft");
    expect(deriveStage([a("unknown", 5), a("invitation", 1)], null)).toBe("inviting");
    // a dateless invitation counts as the earliest event, so a dated cancellation after it wins
    expect(deriveStage([a("invitation"), a("cancellation", 3)], null)).toBe("cancelled");
    expect(deriveStage([a("invitation"), a("cancellation")], null)).toBe("inviting"); // tie → invitation
  });

  it("does not depend on input order", () => {
    expect(deriveStage([a("cancellation", 3), a("invitation", 2)], null)).toBe("cancelled");
  });
});

const NOW = new Date("2026-10-03T00:00:00Z");

const egp = (id: string, typeName: string | null, publishDate: string | null, path: string | null = "f.pdf"): EgpAnnouncement => ({
  id,
  masterAnnounceTypeName: typeName,
  projectAnnouncementPublishDate: publishDate,
  projectAnnouncementPath: path,
});

describe("buildProcurement", () => {
  it("classifies, sorts oldest first, and derives the stage", () => {
    const p = buildProcurement(
      [
        egp("inv", "ประกาศเชิญชวน", "2026-09-10T00:00:00Z"),
        egp("tor", "ร่างขอบเขตของงาน (TOR)", "2026-09-01T00:00:00Z"),
        egp("nodate", null, null, null),
      ],
      " ระหว่างดำเนินการ ",
      NOW
    );
    expect(p.announcements.map((x) => x.announcementId)).toEqual(["nodate", "tor", "inv"]);
    expect(p.announcements[0]).toMatchObject({ kind: "unknown", hasFile: false, publishedAt: undefined });
    expect(p.announcements[2]).toMatchObject({ kind: "invitation", hasFile: true });
    expect(p.announcements[2]?.publishedAt).toEqual(new Date("2026-09-10T00:00:00Z"));
    expect(p.stage).toBe("inviting");
    expect(p.contractStatus).toBe("ระหว่างดำเนินการ");
    expect(p.lastCheckedAt).toBe(NOW);
    expect(p.bidDeadline).toBeUndefined();
  });

  it("ignores an unparseable publish date and an empty contract status", () => {
    const p = buildProcurement([egp("a", "ประกาศเชิญชวน", "not-a-date")], "  ", NOW);
    expect(p.announcements[0]?.publishedAt).toBeUndefined();
    expect(p.contractStatus).toBeUndefined();
  });

  it("drops announcements with a blank id and still derives the stage from the rest", () => {
    const p = buildProcurement(
      [egp("", "ประกาศเชิญชวน", "2026-09-10T00:00:00Z"), egp("  ", "ประกาศเชิญชวน", "2026-09-11T00:00:00Z"), egp("tor", "ร่างขอบเขตของงาน (TOR)", "2026-09-01T00:00:00Z")],
      null,
      NOW
    );
    expect(p.announcements.map((x) => x.announcementId)).toEqual(["tor"]);
    expect(p.stage).toBe("draft");
  });

  it("returns draft with no announcements", () => {
    expect(buildProcurement([], null, NOW).stage).toBe("draft");
  });
});

describe("mergeProcurement", () => {
  const fresh = (): IProcurement =>
    buildProcurement(
      [egp("tor", "ร่างขอบเขตของงาน (TOR)", "2026-09-01T00:00:00Z"), egp("inv", "ประกาศเชิญชวน", "2026-09-10T00:00:00Z")],
      "ระหว่างดำเนินการ",
      NOW
    );

  it("returns fresh data with null storageKeys and no deadline when nothing existed", () => {
    const merged = mergeProcurement(null, fresh());
    expect(merged.stage).toBe("inviting");
    expect(merged.announcements.every((x) => x.storageKey === null)).toBe(true);
    expect(merged.bidDeadline).toBeNull();
  });

  it("keeps the existing bidDeadline and per-announcement storageKey across a refresh", () => {
    const existing: IProcurement = {
      ...fresh(),
      stage: "draft",
      bidDeadline: { date: new Date("2026-10-20T00:00:00Z"), source: "admin", extractedAt: NOW },
      announcements: fresh().announcements.map((x) =>
        x.announcementId === "inv" ? { ...x, storageKey: "tor-pdfs/1/inv.pdf" } : x
      ),
    };
    const merged = mergeProcurement(existing, { ...fresh(), contractStatus: "ส่งงานครบถ้วน" });
    expect(merged.contractStatus).toBe("ส่งงานครบถ้วน"); // fresh data wins
    expect(merged.stage).toBe("inviting"); // fresh stage wins
    expect(merged.bidDeadline?.source).toBe("admin");
    expect(merged.announcements.find((x) => x.announcementId === "inv")?.storageKey).toBe("tor-pdfs/1/inv.pdf");
    expect(merged.announcements.find((x) => x.announcementId === "tor")?.storageKey).toBeNull();
  });

  it("keeps the existing deadlineAttempt across a refresh", () => {
    const attempt = { announcementId: "inv", at: NOW, outcome: "unreadable" as const };
    const merged = mergeProcurement({ ...fresh(), deadlineAttempt: attempt }, fresh());
    expect(merged.deadlineAttempt).toEqual(attempt);
    expect(mergeProcurement(null, fresh()).deadlineAttempt ?? null).toBeNull();
  });

  it("drops a storageKey whose announcement no longer exists", () => {
    const existing: IProcurement = {
      ...fresh(),
      announcements: [{ announcementId: "gone", kind: "invitation", hasFile: true, storageKey: "k" }],
    };
    const merged = mergeProcurement(existing, fresh());
    expect(merged.announcements.map((x) => x.announcementId)).not.toContain("gone");
  });
});
