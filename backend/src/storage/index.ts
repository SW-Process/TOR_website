import { LocalDiskStorage } from "./localDiskStorage";
import { GcsStorage } from "./gcsStorage";
import type { BlobStorage } from "./storage.types";

export type { BlobStorage, BlobPutResult } from "./storage.types";

let instance: BlobStorage | null = null;

function build(): BlobStorage {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "local") {
    return new LocalDiskStorage(process.env.STORAGE_LOCAL_DIR ?? "./storage");
  }
  if (driver === "gcs") {
    return new GcsStorage(process.env.GCS_BUCKET ?? "");
  }
  throw new Error(`unknown storage driver: ${driver}`);
}

/** Process-wide blob store, chosen by STORAGE_DRIVER. */
export function getStorage(): BlobStorage {
  if (!instance) instance = build();
  return instance;
}

/** Test hook: pass a fake to override, or null to force a rebuild next call. */
export function setStorageForTest(s: BlobStorage | null): void {
  instance = s;
}
