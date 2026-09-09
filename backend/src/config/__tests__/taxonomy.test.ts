import { TAXONOMY, TAXONOMY_VERSION, isTaxonomyCategory, fallbackCategory } from "../taxonomy";

describe("taxonomy", () => {
  it("is versioned and ends with 'other'", () => {
    expect(TAXONOMY_VERSION).toBe("2026-08-31");
    expect(TAXONOMY[TAXONOMY.length - 1]).toBe("other");
  });

  it("has no duplicate slugs", () => {
    expect(new Set(TAXONOMY).size).toBe(TAXONOMY.length);
  });

  it("validates membership", () => {
    expect(isTaxonomyCategory("information-system")).toBe(true);
    expect(isTaxonomyCategory("not-a-real-category")).toBe(false);
  });

  it("maps obvious text to a fallback category, else 'other'", () => {
    expect(fallbackCategory("จัดหาระบบกล้องโทรทัศน์วงจรปิด CCTV")).toBe("cctv-its");
    expect(fallbackCategory("จ้างบำรุงรักษาระบบ")).toBe("system-maintenance");
    expect(fallbackCategory("ซื้อซอฟต์แวร์ลิขสิทธิ์ Microsoft")).toBe("software-license");
    expect(fallbackCategory("บางอย่างที่ไม่รู้จัก")).toBe("other");
  });
});
