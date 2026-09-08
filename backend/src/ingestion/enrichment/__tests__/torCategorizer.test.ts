import { TaxonomyCategorizer } from "../torCategorizer";

const c = new TaxonomyCategorizer();

describe("TaxonomyCategorizer", () => {
  it("advertises its id and taxonomy version", () => {
    expect(c.id).toBe("taxonomy-v1");
    expect(c.taxonomyVersion).toBe("2026-08-31");
  });

  it("trusts a valid AI category", () => {
    const r = c.categorize({ title: "x", aiCategory: "web-application", aiTags: ["public-facing"] });
    expect(r.category).toBe("web-application");
    expect(r.tags).toEqual(["public-facing"]);
  });

  it("falls back on an invalid or missing AI category", () => {
    expect(c.categorize({ title: "จ้างบำรุงรักษาระบบ ERP", aiCategory: "bogus" }).category).toBe("system-maintenance");
    expect(c.categorize({ title: "จัดหากล้อง CCTV", goodsCategory: "ระบบกล้องวงจรปิด" }).category).toBe("cctv-its");
    expect(c.categorize({ title: "ไม่รู้จัก" }).category).toBe("other");
  });
});
