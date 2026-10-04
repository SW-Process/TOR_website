import { Type } from "@google/genai";
import {
  GeminiExtractor,
  buildPrompt,
  RESPONSE_SCHEMA,
  SYSTEM_INSTRUCTION,
  MAX_INLINE_PDF_BYTES,
} from "../geminiExtractor";
import type { ExtractInput } from "../torExtractor";

const noopSleep = async (): Promise<void> => undefined;

const input: ExtractInput = {
  pdfs: [{ fileName: "tor.pdf", content: Buffer.from("%PDF-1.4 fake") }],
  meta: {
    projectCode: "69000000001",
    title: "จ้างพัฒนาระบบสารสนเทศ",
    agency: "สำนักการแพทย์",
    budget: 5_000_000,
    announcementDate: "2026-08-01T00:00:00.000Z",
  },
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
  fairnessSignals: [{ field: "budget", severity: "medium", message: "งบต่างจากราคากลางพอสมควร" }],
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
    expect(RESPONSE_SCHEMA.properties?.fairnessSignals?.type).toBe(Type.ARRAY);
    expect(RESPONSE_SCHEMA.properties?.fairnessSignals?.items?.type).toBe(Type.OBJECT);
    const allTypes = [
      RESPONSE_SCHEMA.type,
      ...Object.values(RESPONSE_SCHEMA.properties ?? {}).map((p) => p.type),
    ];
    for (const t of allTypes) expect(Object.values(Type)).toContain(t);
  });

  it("instructs the model to convert submissionDeadline out of the Thai Buddhist Era into Gregorian/ISO", () => {
    // TOR source PDFs print dates in พ.ศ. (ค.ศ. + 543); Gemini must convert
    // before returning submissionDeadline, or a date like "25 เมษายน 2567"
    // comes back as the literal (wrong) year "2567" instead of "2024".
    expect(SYSTEM_INSTRUCTION).toMatch(/พ\.ศ\..*(ค\.ศ\.|Gregorian)|Gregorian.*พ\.ศ\./);
    expect(SYSTEM_INSTRUCTION.toLowerCase()).toContain("543");
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

  it("carries fairnessSignals through to the validated result", async () => {
    const generate = jest.fn().mockResolvedValue({ text: goodJson });
    const x = new GeminiExtractor({ model: "gemini-2.5-flash", generate });
    const result = await x.extract(input);
    expect(result.fairnessSignals).toEqual([
      { field: "budget", severity: "medium", message: "งบต่างจากราคากลางพอสมควร" },
    ]);
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

  it("includes the announcement date when known", () => {
    const p = buildPrompt(input);
    expect(p).toContain("2026-08-01T00:00:00.000Z");
  });
});

describe("GeminiExtractor.extractBidDeadline", () => {
  const input = {
    pdf: { fileName: "inv.pdf", content: Buffer.from("%PDF-1.4 fake") },
    meta: { projectCode: "69010000001", title: "จ้างพัฒนาระบบ" },
  };
  const deadlineJson = JSON.stringify({ date: "2026-10-20", time: "16:30", confidence: 0.9 });

  it("returns the parsed result and sends the PDF with the deadline instruction", async () => {
    const generate = jest.fn().mockResolvedValue({ text: deadlineJson });
    const x = new GeminiExtractor({ model: "gemini-2.5-flash", generate });
    await expect(x.extractBidDeadline(input)).resolves.toEqual({ date: "2026-10-20", time: "16:30", confidence: 0.9 });
    const call = generate.mock.calls[0][0] as {
      config: { systemInstruction: string };
      contents: { parts: { inlineData?: { mimeType: string } }[] };
    };
    expect(call.config.systemInstruction).toContain("กำหนดยื่นข้อเสนอ");
    expect(call.config.systemInstruction).toContain('"YYYY-MM"');
    expect(call.contents.parts.some((p) => p.inlineData?.mimeType === "application/pdf")).toBe(true);
  });

  it("sends the announcement date in the user text, or (unknown) when not given", async () => {
    const generate = jest.fn().mockResolvedValue({ text: deadlineJson });
    const x = new GeminiExtractor({ model: "gemini-2.5-flash", generate });
    await x.extractBidDeadline({ ...input, meta: { ...input.meta, announcementDate: "2026-08-28" } });
    await x.extractBidDeadline(input);
    const textOf = (n: number) =>
      (generate.mock.calls[n][0] as { contents: { parts: { text?: string }[] } }).contents.parts[0]?.text ?? "";
    expect(textOf(0)).toContain("Known announcement date (Gregorian, from e-GP metadata): 2026-08-28");
    expect(textOf(1)).toContain("Known announcement date (Gregorian, from e-GP metadata): (unknown)");
  });

  it("tells the model to check the year against the announcement date", async () => {
    const generate = jest.fn().mockResolvedValue({ text: deadlineJson });
    const x = new GeminiExtractor({ model: "gemini-2.5-flash", generate });
    await x.extractBidDeadline(input);
    const sys = (generate.mock.calls[0][0] as { config: { systemInstruction: string } }).config.systemInstruction;
    expect(sys).toContain("announcement date");
    expect(sys).toContain("re-read the year digits");
  });

  it("leaves output headroom beyond the thinking budget so the JSON cannot be truncated", async () => {
    const generate = jest.fn().mockResolvedValue({ text: deadlineJson });
    const x = new GeminiExtractor({ model: "gemini-2.5-flash", generate });
    await x.extractBidDeadline(input);
    const cfg = generate.mock.calls[0][0].config as {
      maxOutputTokens: number;
      thinkingConfig: { thinkingBudget: number };
    };
    expect(cfg.maxOutputTokens).toBeGreaterThanOrEqual(cfg.thinkingConfig.thinkingBudget + 1024);
  });

  it("returns an empty result without calling the model when the PDF is oversized", async () => {
    const generate = jest.fn();
    const x = new GeminiExtractor({ model: "gemini-2.5-flash", generate });
    const big = { ...input, pdf: { fileName: "big.pdf", content: Buffer.alloc(MAX_INLINE_PDF_BYTES + 1) } };
    await expect(x.extractBidDeadline(big)).resolves.toEqual({ date: null, time: null, confidence: 0 });
    expect(generate).not.toHaveBeenCalled();
  });

  it("retries a 429 like extract() does", async () => {
    const generate = jest
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("rate"), { status: 429 }))
      .mockResolvedValueOnce({ text: deadlineJson });
    const x = new GeminiExtractor({ model: "gemini-2.5-flash", generate, maxRetries: 2, sleep: async () => {} });
    await x.extractBidDeadline(input);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("rejects a response that does not match the schema", async () => {
    const generate = jest.fn().mockResolvedValue({ text: JSON.stringify({ date: 5 }) });
    const x = new GeminiExtractor({ model: "gemini-2.5-flash", generate });
    await expect(x.extractBidDeadline(input)).rejects.toThrow();
  });
});
