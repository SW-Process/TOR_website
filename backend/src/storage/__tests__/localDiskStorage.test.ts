import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDiskStorage } from "../localDiskStorage";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "blobstore-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const KEY = "tor-pdfs/69000000001/ann-1.pdf";

describe("LocalDiskStorage", () => {
  it("put writes the file under the root and reports its size", async () => {
    const storage = new LocalDiskStorage(root);
    const body = Buffer.from("%PDF-1.4 fake");

    const result = await storage.put(KEY, body, { contentType: "application/pdf" });

    expect(result).toEqual({ key: KEY, size: body.length });
    expect(await readFile(join(root, KEY))).toEqual(body);
  });

  it("exists reflects whether the key was written", async () => {
    const storage = new LocalDiskStorage(root);
    expect(await storage.exists(KEY)).toBe(false);
    await storage.put(KEY, Buffer.from("x"), { contentType: "application/pdf" });
    expect(await storage.exists(KEY)).toBe(true);
  });

  it("getStream yields the stored bytes", async () => {
    const storage = new LocalDiskStorage(root);
    const body = Buffer.from("hello tor");
    await storage.put(KEY, body, { contentType: "application/pdf" });

    const stream = await storage.getStream(KEY);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks)).toEqual(body);
  });

  it("getStream rejects for a missing key", async () => {
    const storage = new LocalDiskStorage(root);
    await expect(storage.getStream("nope/missing.pdf")).rejects.toThrow();
  });

  it("publicUrl is null for local disk", () => {
    expect(new LocalDiskStorage(root).publicUrl(KEY)).toBeNull();
  });
});
