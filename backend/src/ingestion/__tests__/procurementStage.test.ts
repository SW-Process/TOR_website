import type { AnnouncementKind } from "../../models/Tor";
import { classifyAnnouncement, deriveStage } from "../procurementStage";

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
