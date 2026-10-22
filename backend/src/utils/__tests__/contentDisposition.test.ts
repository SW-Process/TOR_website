import { contentDisposition } from "../contentDisposition";

describe("contentDisposition (ASVS 5.4.2, RFC 6266)", () => {
  it("keeps a plain name as it is", () => {
    expect(contentDisposition("inline", "tor.pdf")).toBe(`inline; filename="tor.pdf"; filename*=UTF-8''tor.pdf`);
  });

  it("encodes a Thai name and gives an ASCII fallback", () => {
    const header = contentDisposition("inline", "ร่างขอบเขตงาน.pdf");
    expect(header).toMatch(/^inline; filename="_+\.pdf"; filename\*=UTF-8''%E0%B8%A3/);
    expect(decodeURIComponent(header.split("''")[1]!)).toBe("ร่างขอบเขตงาน.pdf");
  });

  it("can't be used to break out of the header or the quotes", () => {
    const header = contentDisposition("attachment", 'evil".pdf\r\nSet-Cookie: x=1');
    expect(header).not.toMatch(/[\r\n]/);
    expect(header.split('"').length).toBe(3); // only the two quotes around the fallback
  });

  it("drops path parts and falls back when nothing is left", () => {
    expect(contentDisposition("inline", "../../etc/passwd")).toContain(`filename="passwd"`);
    expect(contentDisposition("inline", "C:\\docs\\tor.pdf")).toContain(`filename="tor.pdf"`);
    expect(contentDisposition("inline", "\u202e", "tor.pdf")).toContain(`filename="tor.pdf"`);
  });
});
