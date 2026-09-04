import pdfParse from "pdf-parse";

export type TextLayer = "digital" | "scanned" | "unreadable";

export interface PdfInspectResult {
  pageCount: number | null;
  textLayer: TextLayer;
}

export type PdfParseFn = (buf: Buffer) => Promise<{ numpages: number; text: string }>;

/** A page averaging fewer than this many characters needs OCR. Verbatim from munyin.py. */
export const TEXT_LAYER_MIN_CHARS_PER_PAGE = 200;

const defaultParse: PdfParseFn = async (buf) => {
  const data = await pdfParse(buf);
  return { numpages: data.numpages, text: data.text };
};

/**
 * Report page count and whether a PDF carries a usable text layer.
 * `digital` = extractable text, `scanned` = needs OCR, `unreadable` = not a parseable PDF.
 */
export async function pdfInspect(buf: Buffer, parse: PdfParseFn = defaultParse): Promise<PdfInspectResult> {
  try {
    const { numpages, text } = await parse(buf);
    if (!numpages || numpages < 1) {
      return { pageCount: null, textLayer: "scanned" };
    }
    const perPage = text.length / numpages;
    return {
      pageCount: numpages,
      textLayer: perPage >= TEXT_LAYER_MIN_CHARS_PER_PAGE ? "digital" : "scanned",
    };
  } catch {
    return { pageCount: null, textLayer: "unreadable" };
  }
}

export default pdfInspect;
