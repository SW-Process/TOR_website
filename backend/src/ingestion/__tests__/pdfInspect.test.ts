import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pdfInspect, TEXT_LAYER_MIN_CHARS_PER_PAGE } from "../pdfInspect";

const fixture = (name: string): Buffer => readFileSync(join(__dirname, "fixtures/pdf", name));

describe("pdfInspect (injected parser — threshold logic)", () => {
  const many = (n: number): string => "a".repeat(n);

  it("classifies >= threshold chars/page as digital", async () => {
    const result = await pdfInspect(Buffer.from("x"), async () => ({
      numpages: 2,
      text: many(TEXT_LAYER_MIN_CHARS_PER_PAGE * 2),
    }));
    expect(result).toEqual({ pageCount: 2, textLayer: "digital" });
  });

  it("classifies < threshold chars/page as scanned", async () => {
    const result = await pdfInspect(Buffer.from("x"), async () => ({
      numpages: 4,
      text: many(50),
    }));
    expect(result).toEqual({ pageCount: 4, textLayer: "scanned" });
  });

  it("returns unreadable when the parser throws", async () => {
    const result = await pdfInspect(Buffer.from("x"), async () => {
      throw new Error("bad xref");
    });
    expect(result).toEqual({ pageCount: null, textLayer: "unreadable" });
  });

  it("treats zero pages as scanned, not a divide-by-zero", async () => {
    const result = await pdfInspect(Buffer.from("x"), async () => ({ numpages: 0, text: "" }));
    expect(result).toEqual({ pageCount: null, textLayer: "scanned" });
  });
});

describe("pdfInspect (real pdf-parse)", () => {
  it("detects a text layer in a real digital TOR pdf", async () => {
    const result = await pdfInspect(fixture("tor-digital-sample.pdf"));
    expect(result.textLayer).toBe("digital");
    expect(result.pageCount).toBe(4);
  });

  it("classifies a real scanned TOR pdf as scanned", async () => {
    const result = await pdfInspect(fixture("tor-scanned-sample.pdf"));
    expect(result.textLayer).toBe("scanned");
    expect(result.pageCount).toBe(1);
  });

  it("classifies a non-PDF buffer as unreadable", async () => {
    const result = await pdfInspect(Buffer.from("definitely not a pdf"));
    expect(result).toEqual({ pageCount: null, textLayer: "unreadable" });
  });
});
