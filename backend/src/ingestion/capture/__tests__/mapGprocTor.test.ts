import { mapGprocTor } from "../mapGprocTor";

const NOW = new Date("2026-10-07T00:00:00Z");
const detail = (over: Record<string, unknown> = {}) => ({
  projectId: "69099312832",
  projectStatus: "A",
  announceType: "D0",
  methodId: "16",
  stepId: "M03",
  projectName: "  ประกวดราคาจ้างบำรุงรักษาระบบ  ",
  deptName: "กรุงเทพมหานคร",
  deptSubName: "สำนักงานพัฒนาระบบสารสนเทศดิจิทัล",
  ...over,
});
const row = (announceType: string, announceDate: string, priceBuild: number | null = null) => ({ announceType, announceDate, announceFlag: "A", priceBuild });

describe("mapGprocTor", () => {
  it("maps the display fields, the earliest announcement date and the first reference price", () => {
    const m = mapGprocTor({ detail: detail(), announcements: [row("D0", "2026-09-30T17:00:00.000Z"), row("B0", "2026-09-22T17:00:00.000Z", 6055000)] }, NOW);
    expect(m?.set).toMatchObject({
      title: "ประกวดราคาจ้างบำรุงรักษาระบบ",
      agency: "สำนักงานพัฒนาระบบสารสนเทศดิจิทัล",
      department: "กรุงเทพมหานคร",
      referencePrice: 6055000,
    });
    expect(m?.set.announcementDate).toEqual(new Date("2026-09-22T17:00:00.000Z"));
    expect(m?.set.budget).toBeUndefined();
    expect(m?.procurement).toMatchObject({ stage: "inviting", source: "gproc" });
  });

  it("is stable: the same input gives the same hash, a different title a different one", () => {
    const a = mapGprocTor({ detail: detail(), announcements: [] }, NOW);
    const b = mapGprocTor({ detail: detail(), announcements: [] }, new Date("2027-01-01"));
    const c = mapGprocTor({ detail: detail({ projectName: "อื่น" }), announcements: [] }, NOW);
    expect(a?.sourceContentHash).toBe(b?.sourceContentHash);
    expect(a?.sourceContentHash).not.toBe(c?.sourceContentHash);
  });

  it("omits fields process5 did not give (no NaN, no empty strings)", () => {
    const m = mapGprocTor({ detail: detail({ deptSubName: null, deptName: " " }), announcements: [] }, NOW);
    expect(m?.set.agency).toBeUndefined();
    expect(m?.set.department).toBeUndefined();
    expect(m?.set.referencePrice).toBeUndefined();
    expect(m?.set.announcementDate).toBeUndefined();
  });

  it("returns null when the project has no name", () => {
    expect(mapGprocTor({ detail: detail({ projectName: " " }), announcements: [] }, NOW)).toBeNull();
    expect(mapGprocTor({ detail: detail({ projectName: null }), announcements: [] }, NOW)).toBeNull();
  });

  it("reports unknown announce codes from the shared mapper", () => {
    expect(mapGprocTor({ detail: detail(), announcements: [row("Z9", "2026-10-01T00:00:00.000Z")] }, NOW)?.unknownCodes).toEqual(["Z9"]);
  });
});
