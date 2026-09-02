import type { BlobPutResult, BlobStorage } from "./storage.types";

const NOT_IMPLEMENTED = "gcs storage not implemented";

/**
 * Placeholder so `STORAGE_DRIVER=gcs` is a one-line switch later.
 * Real implementation (`@google-cloud/storage`, signed URLs) lands in the GCS phase.
 */
export class GcsStorage implements BlobStorage {
  constructor(private readonly bucket: string) {}

  put(_key: string, _body: Buffer, _opts: { contentType: string }): Promise<BlobPutResult> {
    return Promise.reject(new Error(NOT_IMPLEMENTED));
  }

  getStream(_key: string): Promise<NodeJS.ReadableStream> {
    return Promise.reject(new Error(NOT_IMPLEMENTED));
  }

  exists(_key: string): Promise<boolean> {
    return Promise.reject(new Error(NOT_IMPLEMENTED));
  }

  publicUrl(key: string): string | null {
    return `https://storage.googleapis.com/${this.bucket}/${key}`;
  }
}

export default GcsStorage;
