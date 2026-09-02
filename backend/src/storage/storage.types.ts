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
  /** Absolute URL when the driver serves files directly (GCS), else null. */
  publicUrl(key: string): string | null;
}
