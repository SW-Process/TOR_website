import { detectImageType } from "../imageType";

const bytes = (...b: number[]) => Buffer.from(b);
const text = (s: string) => Buffer.from(s, "latin1");

describe("detectImageType (ASVS 5.2.2)", () => {
  it("recognises JPEG, PNG, GIF and WebP by content", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe("image/jpeg");
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    expect(detectImageType(text("GIF89a......"))).toBe("image/gif");
    expect(detectImageType(text("GIF87a......"))).toBe("image/gif");
    expect(detectImageType(text("RIFF\x10\x00\x00\x00WEBPVP8 "))).toBe("image/webp");
  });

  it("rejects HTML, SVG and other files dressed up as images", () => {
    expect(detectImageType(text("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(detectImageType(text('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull();
    expect(detectImageType(text("%PDF-1.7"))).toBeNull();
    expect(detectImageType(text("RIFF\x10\x00\x00\x00WAVEfmt "))).toBeNull();
  });

  it("rejects empty and truncated input", () => {
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType(bytes(0x89, 0x50))).toBeNull();
  });
});
