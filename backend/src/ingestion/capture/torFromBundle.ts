import { unzipSync } from "fflate";

export interface BundleTor {
  name: string;
  content: Buffer;
}

const DEFAULT_MAX_ENTRY_BYTES = 50 * 1024 * 1024;
const baseName = (name: string): string => name.split(/[\\/]/).pop() ?? name;

/**
 * Pick the TOR draft PDF out of an e-GP document bundle and extract only that entry.
 * Rule: a `.pdf` whose base name contains "TOR" (case-insensitive); an `Attach_TOR…` name wins, then the
 * largest. Names inside these zips may be TIS-620 encoded, so only the ASCII part is matched. Any
 * unreadable/corrupt zip, or no matching entry, gives null (never throws).
 */
export function torFromBundle(zip: Buffer, opts: { maxEntryBytes?: number } = {}): BundleTor | null {
  const max = opts.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES;
  if (zip.length < 4) return null;
  const candidates: { name: string; size: number; attach: boolean }[] = [];
  try {
    // A filter that always returns false lists the central directory without inflating anything.
    unzipSync(new Uint8Array(zip), {
      filter: (f) => {
        const base = baseName(f.name);
        if (/\.pdf$/i.test(base) && /TOR/i.test(base) && f.originalSize <= max) {
          candidates.push({ name: f.name, size: f.originalSize, attach: /^Attach_TOR/i.test(base) });
        }
        return false;
      },
    });
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => Number(b.attach) - Number(a.attach) || b.size - a.size);
    const chosen = candidates[0]!;
    const files = unzipSync(new Uint8Array(zip), { filter: (f) => f.name === chosen.name });
    const bytes = files[chosen.name];
    if (!bytes || bytes.length > max) return null;
    return { name: chosen.name, content: Buffer.from(bytes) };
  } catch {
    return null;
  }
}
