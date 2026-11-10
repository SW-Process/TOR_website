import { Tor } from "../../models";

/**
 * TORs created by a capture (source "gproc") that never got a source document, so they are not
 * queued for AI. `null` matches both a missing `sourceDocument` and a null `storageKey`.
 * Re-capturing the project from the extension retries the file. A project whose invitation exists only as
 * an HTML page (see gprocUrl.ts) is queued without a document and not counted.
 */
export function countCaptureStuck(): Promise<number> {
  return Tor.countDocuments({
    "procurement.source": "gproc",
    pipelineStatus: "pending",
    "sourceDocument.storageKey": null,
    // an HTML-only announcement is queued from the project details, so it is not stuck
    sourceAnnouncementHtmlUrl: null,
  });
}
