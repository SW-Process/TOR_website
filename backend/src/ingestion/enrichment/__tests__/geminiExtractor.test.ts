import { GeminiExtractor, buildPrompt } from "../geminiExtractor";
import type { ExtractInput } from "../torExtractor";

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
    const x = new GeminiExtractor({ model: "gemini-2.5-flash", generate, maxRetries: 2 });
    await expect(x.extract(input)).resolves.toMatchObject({ isSoftwareRelated: true });
    expect(generate).toHaveBeenCalledTimes(2);
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

describe("buildPrompt", () => {
  it("embeds the metadata and wraps the doc marker", () => {
    const p = buildPrompt(input);
    expect(p).toContain("69000000001");
    expect(p).toContain("สำนักการแพทย์");
    expect(p).toContain("<tor_document>");
  });
});
