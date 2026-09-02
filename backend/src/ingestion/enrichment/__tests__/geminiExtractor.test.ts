import { Type } from "@google/genai";
import {
  GeminiExtractor,
  buildPrompt,
  RESPONSE_SCHEMA,
  MAX_INLINE_PDF_BYTES,
} from "../geminiExtractor";
import type { ExtractInput } from "../torExtractor";

const noopSleep = async (): Promise<void> => undefined;

const input: ExtractInput = {
  pdfs: [{ fileName: "tor.pdf", content: Buffer.from("%PDF-1.4 fake") }],
  meta: { projectCode: "69000000001", title: "จ้างพัฒนาระบบสารสนเทศ", agency: "สำนักการแพทย์", budget: 5_000_000 },
};

const goodJson = JSON.stringify({
  isSoftwareRelated: true,
  classificationReason: "จ้างพัฒนาระบบ",
  confidence: 0.88,
  category: "information-system",
  categoryTags: ["mis"],
  summary: "สรุป...",
  keyPoints: ["a"],
  qualifications: ["b"],
  evaluationCriteria: [{ label: "ราคา", weight: 30 }],
  technologyStack: ["Node.js"],
  submissionDeadline: null,
});

describe("GeminiExtractor", () => {
  it("id is the resolved model name", () => {
    const x = new GeminiExtractor({ model: "gemini-2.5-flash", generate: async () => ({ text: goodJson }) });
    expect(x.id).toBe("gemini-2.5-flash");
  });

  it("sends one inlineData part per PDF plus the prompt, and returns a validated result", async () => {
    const generate = jest.fn().mockResolvedValue({ text: goodJson, usageMetadata: { totalTokenCount: 1234 } });
    const x = new GeminiExtractor({ model: "gemini-2.5-flash", generate });
    const result = await x.extract(input);
    expect(result.isSoftwareRelated).toBe(true);
    expect(result.category).toBe("information-system");

    const call = generate.mock.calls[0][0] as { model: string; contents: { parts: unknown[] } };
    expect(call.model).toBe("gemini-2.5-flash");
    const parts = call.contents.parts as Array<Record<string, unknown>>;
    const inlineParts = parts.filter((p) => "inlineData" in p);
    expect(inlineParts).toHaveLength(1);
    expect((inlineParts[0]!.inlineData as { mimeType: string }).mimeType).toBe("application/pdf");
    expect(parts.some((p) => typeof p.text === "string" && (p.text as string).includes("69000000001"))).toBe(true);
  });

  it("retries once on a 429 then succeeds", async () => {
    const err = Object.assign(new Error("RESOURCE_EXHAUSTED"), { status: 429 });
    const generate = jest
      .fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ text: goodJson });
    const x = new GeminiExtractor({ model: "gemini-2.5-flash", generate, maxRetries: 2, sleep: noopSleep });
    await expect(x.extract(input)).resolves.toMatchObject({ isSoftwareRelated: true });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("RESPONSE_SCHEMA uses the SDK Type enum members, not lowercase strings", () => {
    expect(RESPONSE_SCHEMA.type).toBe(Type.OBJECT);
    expect(RESPONSE_SCHEMA.properties?.isSoftwareRelated?.type).toBe(Type.BOOLEAN);
    expect(RESPONSE_SCHEMA.properties?.classificationReason?.type).toBe(Type.STRING);
    expect(RESPONSE_SCHEMA.properties?.confidence?.type).toBe(Type.NUMBER);
    expect(RESPONSE_SCHEMA.properties?.categoryTags?.type).toBe(Type.ARRAY);
    expect(RESPONSE_SCHEMA.properties?.categoryTags?.items?.type).toBe(Type.STRING);
    expect(RESPONSE_SCHEMA.properties?.evaluationCriteria?.items?.type).toBe(Type.OBJECT);
    const allTypes = [
      RESPONSE_SCHEMA.type,
      ...Object.values(RESPONSE_SCHEMA.properties ?? {}).map((p) => p.type),
    ];
    for (const t of allTypes) expect(Object.values(Type)).toContain(t);
  });

  it("logs a usageMetadata cost line under component classifier.gemini on the success path", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const generate = jest.fn().mockResolvedValue({ text: goodJson, usageMetadata: { totalTokenCount: 42 } });
      const x = new GeminiExtractor({ model: "gemini-2.5-flash", generate });
      await x.extract(input);
      const payloads = logSpy.mock.calls.map((c) => {
        try {
          return JSON.parse(String(c[0]));
        } catch {
          return null;
        }
      });
      const cost = payloads.find((p) => p && p.component === "classifier.gemini");
      expect(cost).toBeTruthy();
      expect(cost.model).toBe("gemini-2.5-flash");
      expect(cost.usage).toEqual({ totalTokenCount: 42 });
    } finally {
      logSpy.mockRestore();
    }
  });

  it("omits an oversized PDF inline part but still calls generate (metadata-only)", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const generate = jest.fn().mockResolvedValue({ text: goodJson });
      const x = new GeminiExtractor({ model: "gemini-2.5-flash", generate });
      const big: ExtractInput = {
        ...input,
        pdfs: [{ fileName: "huge.pdf", content: Buffer.alloc(MAX_INLINE_PDF_BYTES + 1) }],
      };
      await x.extract(big);
      expect(generate).toHaveBeenCalledTimes(1);
      const call = generate.mock.calls[0][0] as { contents: { parts: Array<Record<string, unknown>> } };
      const parts = call.contents.parts;
      expect(parts.filter((p) => "inlineData" in p)).toHaveLength(0);
      expect(parts.some((p) => typeof p.text === "string")).toBe(true);
      const warned = warnSpy.mock.calls.map((c) => JSON.parse(String(c[0])));
      expect(warned.some((w) => w.component === "classifier.gemini" && w.event === "pdf-skipped")).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("throws when the model returns non-JSON", async () => {
    const x = new GeminiExtractor({ model: "gemini-2.5-flash", generate: async () => ({ text: "not json" }) });
    await expect(x.extract(input)).rejects.toThrow(/invalid JSON|Unexpected token/i);
  });

  it("throws when the JSON fails the schema", async () => {
    const bad = JSON.stringify({ isSoftwareRelated: true }); // missing everything else
    const x = new GeminiExtractor({ model: "gemini-2.5-flash", generate: async () => ({ text: bad }) });
    await expect(x.extract(input)).rejects.toThrow();
  });
});

// Spec §14: live Vertex smoke test. Skipped in CI; documents the wire contract.
// Run with RUN_VERTEX_TESTS=1 and real GOOGLE_CLOUD_PROJECT / ADC credentials.
(process.env.RUN_VERTEX_TESTS === "1" ? describe : describe.skip)("GeminiExtractor (live Vertex)", () => {
  it("resolves to a schema-valid object or rejects with a non-4xx (network/auth) error", async () => {
    const x = new GeminiExtractor();
    const tiny: ExtractInput = {
      pdfs: [{ fileName: "tiny.pdf", content: Buffer.from("%PDF-1.4\n%%EOF\n") }],
      meta: { title: "จ้างพัฒนาระบบสารสนเทศ", agency: "สำนักการแพทย์" },
    };
    try {
      const result = await x.extract(tiny);
      expect(typeof result.isSoftwareRelated).toBe("boolean");
      expect(typeof result.classificationReason).toBe("string");
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    } catch (err) {
      const status =
        (err as { status?: number; code?: number }).status ?? (err as { code?: number }).code;
      if (typeof status === "number") {
        expect(status < 400 || status >= 500).toBe(true);
      }
    }
  }, 60_000);
});

describe("buildPrompt", () => {
  it("embeds the metadata and wraps the doc marker", () => {
    const p = buildPrompt(input);
    expect(p).toContain("69000000001");
    expect(p).toContain("สำนักการแพทย์");
    expect(p).toContain("<tor_document>");
  });
});
