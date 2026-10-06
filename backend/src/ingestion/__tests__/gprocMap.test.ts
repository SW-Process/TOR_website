import { buildGprocProcurement, gprocAnnouncementId } from "../gprocMap";

const NOW = new Date("2026-10-06T00:00:00Z");
const detail = (over: Record<string, unknown> = {}) => ({
  projectId: "69099318020",
  projectStatus: "A",
  announceType: "W0",
  methodId: "16",
  stepId: "W03",
  ...over,
});
const row = (announceType: string, announceDate: string | null, announceFlag: string | null = "A") => ({
  announceType,
  announceDate,
  announceFlag,
});

// Recorded from the real service on 2026-10-06 (project 69099318020, already awarded).
const AWARDED = [
  row("D0", "2026-09-22T17:00:00.000Z"),
  row("BOQ", "2026-09-22T17:00:00.000Z", null),
  row("price", "2026-09-30T17:00:00.000Z", null),
  row("W0", "2026-10-05T17:00:00.000Z"),
];
// Project 69099312832: draft tender doc on 23 Sep, the real invitation on 1 Oct.
const INVITING = [row("B0", "2026-09-22T17:00:00.000Z"), row("BOQ", "2026-09-22T17:00:00.000Z", null), row("D0", "2026-09-30T17:00:00.000Z")];

describe("gprocAnnouncementId", () => {
  it("uses the Bangkok day and no colon", () => {
    expect(gprocAnnouncementId("D0", "2026-09-22T17:00:00.000Z")).toBe("gproc-D0-20260923");
    expect(gprocAnnouncementId("D0", "2026-09-22T17:00:00.000Z")).not.toContain(":");
    expect(gprocAnnouncementId("D0", null)).toBe("gproc-D0-undated");
    expect(gprocAnnouncementId("D0", "not a date")).toBe("gproc-D0-undated");
  });
});

describe("buildGprocProcurement", () => {
  it("maps an awarded project: invitation, reference price and winner, oldest first, stage awarded", () => {
    const { procurement: p, unknownCodes } = buildGprocProcurement({ detail: detail(), announcements: AWARDED }, "ระหว่างดำเนินการ", NOW);
    expect(p.stage).toBe("awarded");
    expect(p.source).toBe("gproc");
    expect(p.contractStatus).toBe("ระหว่างดำเนินการ");
    expect(p.lastCheckedAt).toEqual(NOW);
    expect(p.announcements.map((a) => [a.announcementId, a.kind, a.hasFile])).toEqual([
      ["gproc-D0-20260923", "invitation", true],
      ["gproc-price-20261001", "reference-price", false],
      ["gproc-W0-20261006", "winner", false],
    ]);
    expect(p.announcements[0]!.publishedAt).toEqual(new Date("2026-09-22T17:00:00.000Z"));
    expect(unknownCodes).toEqual([]);
  });

  it("maps an inviting project (draft doc then invitation) to stage inviting", () => {
    const { procurement: p } = buildGprocProcurement({ detail: detail({ announceType: "B0", stepId: "M03" }), announcements: INVITING }, undefined, NOW);
    expect(p.stage).toBe("inviting");
    expect(p.contractStatus).toBeUndefined();
    expect(p.announcements.map((a) => a.kind)).toEqual(["bidding-draft", "invitation"]);
  });

  it("maps a project that only has the draft tender doc to stage draft", () => {
    const { procurement: p } = buildGprocProcurement({ detail: detail({ announceType: "B0" }), announcements: [INVITING[0]!, INVITING[1]!] }, undefined, NOW);
    expect(p.stage).toBe("draft");
  });

  it("forces cancelled when e-GP's projectStatus is R, even with an invitation", () => {
    const { procurement: p } = buildGprocProcurement({ detail: detail({ projectStatus: "R" }), announcements: INVITING }, undefined, NOW);
    expect(p.stage).toBe("cancelled");
  });

  it("never lets an unknown code decide the stage, and reports it once", () => {
    const { procurement: p, unknownCodes } = buildGprocProcurement(
      { detail: detail({ announceType: "B0" }), announcements: [INVITING[0]!, row("X9", "2026-10-01T00:00:00.000Z"), row("X9", "2026-10-02T00:00:00.000Z")] },
      undefined,
      NOW
    );
    expect(p.stage).toBe("draft");
    expect(p.announcements.map((a) => a.kind)).toEqual(["bidding-draft", "unknown", "unknown"]);
    expect(unknownCodes).toEqual(["X9"]);
  });

  it("tolerates an empty list and a row without a date (sorted first)", () => {
    expect(buildGprocProcurement({ detail: detail(), announcements: [] }, undefined, NOW).procurement.stage).toBe("draft");
    const { procurement: p } = buildGprocProcurement({ detail: detail(), announcements: [row("D0", "2026-09-22T17:00:00.000Z"), row("B0", null)] }, undefined, NOW);
    expect(p.announcements.map((a) => a.announcementId)).toEqual(["gproc-B0-undated", "gproc-D0-20260923"]);
  });
});
