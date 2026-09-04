import { createReadStream } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { BlobPutResult, BlobStorage } from "./storage.types";

/** Stores blobs as plain files under `rootDir`, mirroring the key path. */
export class LocalDiskStorage implements BlobStorage {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = resolve(rootDir);
  }

  private pathFor(key: string): string {
    const full = resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new Error(`blob key escapes storage root: ${key}`);
    }
    return full;
  }

  async put(key: string, body: Buffer, _opts: { contentType: string }): Promise<BlobPutResult> {
    const target = this.pathFor(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
    return { key, size: body.length };
  }

  async getStream(key: string): Promise<NodeJS.ReadableStream> {
    const target = this.pathFor(key);
    await access(target); // throws if missing, so callers get a rejected promise
    return createReadStream(target);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }

  publicUrl(_key: string): string | null {
    return null;
  }
}

export default LocalDiskStorage;
