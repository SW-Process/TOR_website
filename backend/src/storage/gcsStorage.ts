import { Storage } from "@google-cloud/storage";
import type { BlobPutResult, BlobStorage } from "./storage.types";

interface GcsFileLike {
  save(body: Buffer, opts: { contentType: string; resumable: boolean }): Promise<void>;
  createReadStream(): NodeJS.ReadableStream;
  exists(): Promise<[boolean]>;
}
interface GcsLike {
  bucket(name: string): { file(key: string): GcsFileLike };
}

/** Blob store backed by a private GCS bucket. Auth is Application Default Credentials. */
export class GcsStorage implements BlobStorage {
  private readonly client: GcsLike;

  constructor(private readonly bucket: string, deps: { storage?: GcsLike } = {}) {
    if (!bucket) throw new Error("GCS_BUCKET is not set");
    this.client = deps.storage ?? (new Storage() as unknown as GcsLike);
  }

  private file(key: string): GcsFileLike {
    return this.client.bucket(this.bucket).file(key);
  }

  async put(key: string, body: Buffer, opts: { contentType: string }): Promise<BlobPutResult> {
    await this.file(key).save(body, { contentType: opts.contentType, resumable: false });
    return { key, size: body.length };
  }

  async getStream(key: string): Promise<NodeJS.ReadableStream> {
    return this.file(key).createReadStream();
  }

  async exists(key: string): Promise<boolean> {
    const [ok] = await this.file(key).exists();
    return ok;
  }

  publicUrl(_key: string): string | null {
    return null;
  }
}

export default GcsStorage;
