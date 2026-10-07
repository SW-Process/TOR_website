import { stripProcurementMethod } from "../stripProcurementMethod";
import { looksSoftwareRelated } from "../../softwareKeywordGate";

describe("stripProcurementMethod", () => {
  it("removes the e-bidding phrase", () => {
    expect(stripProcurementMethod("จ้างเหมาทำความสะอาด ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)")).toBe("จ้างเหมาทำความสะอาด");
    expect(stripProcurementMethod("จ้างเหมา ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-Bidding)")).toBe("จ้างเหมา");
    expect(stripProcurementMethod("จ้างเหมา ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์  (e bidding)")).toBe("จ้างเหมา");
    expect(stripProcurementMethod("จ้างเหมา ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์")).toBe("จ้างเหมา");
  });
  it("removes the e-market phrase", () => {
    expect(stripProcurementMethod("ซื้อวัสดุ ด้วยวิธีตลาดอิเล็กทรอนิกส์ (e-market)")).toBe("ซื้อวัสดุ");
    expect(stripProcurementMethod("ซื้อวัสดุ ด้วยวิธีตลาดอิเล็กทรอนิกส์ (e-Market)")).toBe("ซื้อวัสดุ");
  });
  it("removes the generic electronic-method forms", () => {
    expect(stripProcurementMethod("ซื้อวัสดุ ด้วยวิธีการทางอิเล็กทรอนิกส์")).toBe("ซื้อวัสดุ");
    expect(stripProcurementMethod("ซื้อวัสดุ ด้วยวิธีอิเล็กทรอนิกส์")).toBe("ซื้อวัสดุ");
  });
  it("removes a truncated dangling clause", () => {
    expect(stripProcurementMethod("จ้างเหมาทำความสะอาด ด้วยวิธีประกวดราคาอิเล็กทร")).toBe("จ้างเหมาทำความสะอาด");
    expect(stripProcurementMethod("จ้างเหมาทำความสะอาด ด้วยวิธี")).toBe("จ้างเหมาทำความสะอาด");
  });
  it("keeps the text before the clause", () => {
    const out = stripProcurementMethod("จัดทำระบบอิเล็กทรอนิกส์สำหรับงานทะเบียน ประจำปี 2570 ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)");
    expect(out).toBe("จัดทำระบบอิเล็กทรอนิกส์สำหรับงานทะเบียน ประจำปี 2570");
    expect(looksSoftwareRelated(out)).toBe(true);
  });
  it("leaves a title without a method phrase unchanged", () => {
    expect(stripProcurementMethod("ประกวดราคาจ้างพัฒนาระบบสารสนเทศ")).toBe("ประกวดราคาจ้างพัฒนาระบบสารสนเทศ");
    expect(stripProcurementMethod("")).toBe("");
  });
  it("does not drop a long tail after ด้วยวิธี that carries other info", () => {
    const t = "จ้างเหมาซอฟต์แวร์ ด้วยวิธีพิเศษ " + "ก".repeat(70);
    expect(stripProcurementMethod(t)).toBe(t);
  });
});
