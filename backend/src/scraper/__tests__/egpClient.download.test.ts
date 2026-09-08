import { Readable } from "node:stream";
import { EgpClient, type EgpClientConfig } from "../egpClient";

const baseCfg: EgpClientConfig = {
  apiBase: "https://egp.test/api",
  fileBase: "https://egp.test/file",
  userAgent: "test",
  delayMs: 0,
  maxRetries: 1,
  timeoutMs: 1000,
  maxFileBytes: 10,
  sleep: async () => undefined,
};

function chunkedResponse(chunks: Buffer[], headers: Record<string, string> = {}): Response {
  const body = Readable.toWeb(Readable.from(chunks)) as ReadableStream<Uint8Array>;
  return new Response(body, { status: 200, headers });
}

describe("EgpClient.downloadFile size cap", () => {
  it("rejects an oversized chunked response with no content-length", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      chunkedResponse([Buffer.from("12345"), Buffer.from("67890"), Buffer.from("EXTRA")])
    );
    (global as any).fetch = fetchMock;
    const client = new EgpClient(baseCfg);
    await expect(client.downloadFile("ann-1", "big.pdf")).rejects.toThrow(/e-GP file too large/);
  });

  it("returns the buffer when the body is within the cap", async () => {
    const fetchMock = jest.fn().mockResolvedValue(chunkedResponse([Buffer.from("%PDF-")]));
    (global as any).fetch = fetchMock;
    const client = new EgpClient(baseCfg);
    const buf = await client.downloadFile("ann-1", "ok.pdf");
    expect(buf.toString()).toBe("%PDF-");
  });
});
