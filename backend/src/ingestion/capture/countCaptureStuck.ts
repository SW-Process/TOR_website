import { Tor } from "../../models";

/**
 * TORs created by a capture (source "gproc") that never got a source document, so they are not
 * queued for AI. `null` matches both a missing `sourceDocument` and a null `storageKey`.
 * Re-capturing the project from the extension retries the file.
 */
export function countCaptureStuck(): Promise<number> {
  return Tor.countDocuments({
    "procurement.source": "gproc",
    pipelineStatus: "pending",
    "sourceDocument.storageKey": null,
  });
}
