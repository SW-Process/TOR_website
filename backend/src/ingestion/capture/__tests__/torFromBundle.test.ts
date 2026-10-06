import { zipSync, strToU8 } from "fflate";
import { torFromBundle } from "../torFromBundle";

const pdf = (text: string) => Buffer.from(`%PDF-1.7\n${text}`);
const zip = (files: Record<string, Buffer | Uint8Array>) =>
  Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v instanceof Uint8Array ? v : new Uint8Array(v)]))));

describe("torFromBundle", () => {
  it("takes Attach_TOR*.pdf and ignores the other documents", () => {
    const z = zip({
      "Attach_TOR_1.pdf": pdf("tor"),
      "annoudoc_310000110000077_69099312832.pdf": pdf("announcement"),
      "doc_310000110000077_69099312832.pdf": pdf("bidding document"),
    });
    const out = torFromBundle(z);
    expect(out?.name).toBe("Attach_TOR_1.pdf");
    expect(out?.content.toString()).toContain("tor");
  });

  it("falls back to any pdf whose name contains TOR (case-insensitive), largest first", () => {
    const z = zip({ "ขอบเขต_tor_small.pdf": pdf("s"), "TOR-full-version.PDF": pdf("a much longer body of text") });
    expect(torFromBundle(z)?.name).toBe("TOR-full-version.PDF");
  });

  it("prefers an Attach_TOR name over a larger plain TOR name", () => {
    const z = zip({ "Attach_TOR_1.pdf": pdf("x"), "other_TOR_big.pdf": pdf("x".repeat(500)) });
    expect(torFromBundle(z)?.name).toBe("Attach_TOR_1.pdf");
  });

  it("matches on the base name inside a folder", () => {
    expect(torFromBundle(zip({ "files/Attach_TOR_2.pdf": pdf("t") }))?.name).toBe("files/Attach_TOR_2.pdf");
  });

  it("matches on the base name after a backslash path separator", () => {
    expect(torFromBundle(zip({ "files\\Attach_TOR_2.pdf": pdf("t"), "other_TOR_big.pdf": pdf("x".repeat(500)) }))?.name).toBe("files\\Attach_TOR_2.pdf");
  });

  it("returns null when no entry looks like a TOR, never guessing among the others", () => {
    expect(torFromBundle(zip({ "annoudoc_1.pdf": pdf("a"), "doc_1.pdf": pdf("b"), "tor.txt": Buffer.from("not a pdf") }))).toBeNull();
  });

  it("returns null for an entry over the size cap", () => {
    const z = zip({ "Attach_TOR_1.pdf": pdf("y".repeat(2000)) });
    expect(torFromBundle(z, { maxEntryBytes: 100 })).toBeNull();
  });

  it("returns null for a corrupt or non-zip buffer instead of throwing", () => {
    expect(torFromBundle(Buffer.from("PK\u0003\u0004 this is not really a zip"))).toBeNull();
    expect(torFromBundle(Buffer.alloc(0))).toBeNull();
    expect(strToU8("x").length).toBe(1); // keeps the fflate import honest
  });
});
