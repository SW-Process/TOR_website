export interface BlobPutResult {
  key: string;
  size: number;
}

/**
 * Minimal blob store the ingestion pipeline needs. Implemented by
 * LocalDiskStorage now; GcsStorage later. Callers never learn which.
 */
export interface BlobStorage {
  put(key: string, body: Buffer, opts: { contentType: string }): Promise<BlobPutResult>;
  getStream(key: string): Promise<NodeJS.ReadableStream>;
  exists(key: string): Promise<boolean>;
  /** Remove a blob; a missing key is not an error. Optional so read-only fakes needn't implement it. */
  delete?(key: string): Promise<void>;
  /** Absolute URL when the driver serves files directly (GCS), else null. */
  publicUrl(key: string): string | null;
}
