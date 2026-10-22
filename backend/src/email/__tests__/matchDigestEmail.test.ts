import { buildMatchDigestEmail, type MatchDigestItem } from "../matchDigestEmail";

function item(over: Partial<MatchDigestItem> = {}): MatchDigestItem {
  return {
    title: "ระบบเว็บแอปพลิเคชัน",
    agency: "สำนักการแพทย์",
    budget: 1_250_000,
    link: "http://localhost:3000/tor/abc",
    reasons: ["ตรงกับโปรไฟล์ของคุณ"],
    ...over,
  };
}

const DASHBOARD = "http://localhost:3000/dashboard";

describe("buildMatchDigestEmail", () => {
  it("counts every match in the subject, including ones left out of the list", () => {
    const email = buildMatchDigestEmail({ items: [item(), item()], moreCount: 3, dashboardLink: DASHBOARD });
    expect(email.subject).toContain("5 รายการ");
    expect(email.text).toContain("และอีก 3 รายการ");
    expect(email.html).toContain("และอีก 3 รายการ");
  });

  it("lists each TOR with its agency, budget, reasons and link in both parts", () => {
    const email = buildMatchDigestEmail({
      items: [item({ reasons: ["ตรงกับโปรไฟล์ของคุณ", 'การค้นหาที่บันทึกไว้ "เว็บ"'] })],
      moreCount: 0,
      dashboardLink: DASHBOARD,
    });
    for (const part of [email.text, email.html]) {
      expect(part).toContain("สำนักการแพทย์");
      expect(part).toContain("1,250,000 บาท");
      expect(part).toContain("http://localhost:3000/tor/abc");
      expect(part).toContain(DASHBOARD);
    }
    expect(email.text).toContain('ตรงกับโปรไฟล์ของคุณ, การค้นหาที่บันทึกไว้ "เว็บ"');
    expect(email.html).toContain("การค้นหาที่บันทึกไว้ &quot;เว็บ&quot;");
    expect(email.text).not.toContain("และอีก");
  });

  it("escapes TOR text in the HTML part", () => {
    const email = buildMatchDigestEmail({
      items: [item({ title: `<script>alert(1)</script>`, agency: `A & "B"` })],
      moreCount: 0,
      dashboardLink: DASHBOARD,
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).toContain("A &amp; &quot;B&quot;");
  });

  it("leaves out a missing agency or budget instead of printing a blank", () => {
    const email = buildMatchDigestEmail({
      items: [item({ agency: null, budget: null })],
      moreCount: 0,
      dashboardLink: DASHBOARD,
    });
    expect(email.text).not.toContain("งบประมาณ");
    expect(email.text).not.toContain("null");
    expect(email.html).not.toContain("null");
  });
});
