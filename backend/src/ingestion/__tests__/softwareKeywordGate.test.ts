import { looksSoftwareRelated } from "../softwareKeywordGate";

describe("looksSoftwareRelated", () => {
  it.each([
    "จ้างพัฒนาระบบสารสนเทศเพื่อการบริหาร",
    "ซื้อซอฟต์แวร์ลิขสิทธิ์",
    "จ้างบำรุงรักษาระบบบริหารจัดการเอกสารอิเล็กทรอนิกส์",
    "จัดหาระบบกล้องโทรทัศน์วงจรปิด CCTV",
    "Web application development for the district office",
    "จ้างที่ปรึกษาออกแบบสถาปัตยกรรมคลาวด์",
  ])("passes: %s", (text) => {
    expect(looksSoftwareRelated(text)).toBe(true);
  });

  it.each([
    "จ้างเหมาดูแลต้นไม้และสนามหญ้า",
    "ซื้อยางมะตอยสำเร็จรูป จำนวน 500 ถุง",
    "จ้างก่อสร้างอาคารเรียน 3 ชั้น",
    "ซื้อครุภัณฑ์สำนักงาน โต๊ะ เก้าอี้",
  ])("rejects: %s", (text) => {
    expect(looksSoftwareRelated(text)).toBe(false);
  });

  it("is case-insensitive for ASCII keywords", () => {
    expect(looksSoftwareRelated("SOFTWARE maintenance")).toBe(true);
  });
});
