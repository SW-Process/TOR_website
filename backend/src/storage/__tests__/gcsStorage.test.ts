import { Readable } from "node:stream";
import { GcsStorage } from "../gcsStorage";

function fakeGcs() {
  const files = new Map<string, Buffer>();
  return {
    files,
    client: {
      bucket: () => ({
        file: (key: string) => ({
          save: async (buf: Buffer) => { files.set(key, buf); },
          createReadStream: () => Readable.from([files.get(key) ?? Buffer.alloc(0)]),
          exists: async () => [files.has(key)] as [boolean],
        }),
      }),
    },
  };
}

describe("GcsStorage", () => {
  it("put then exists then getStream round-trips", async () => {
    const { client } = fakeGcs();
    const s = new GcsStorage("bkk-tor-pdfs", { storage: client as never });
    const body = Buffer.from("%PDF-1.4 hello");
    const res = await s.put("tor-pdfs/69/abc.pdf", body, { contentType: "application/pdf" });
    expect(res).toEqual({ key: "tor-pdfs/69/abc.pdf", size: body.length });
    expect(await s.exists("tor-pdfs/69/abc.pdf")).toBe(true);
    expect(await s.exists("missing.pdf")).toBe(false);

    const chunks: Buffer[] = [];
    for await (const c of await s.getStream("tor-pdfs/69/abc.pdf")) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe("%PDF-1.4 hello");
  });

  it("publicUrl is null (bucket is private)", () => {
    const { client } = fakeGcs();
    expect(new GcsStorage("b", { storage: client as never }).publicUrl("x")).toBeNull();
  });
});
