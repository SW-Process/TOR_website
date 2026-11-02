import { createHash } from "node:crypto";
import type { QueryFilter, Types } from "mongoose";
import { Tor } from "../models";
import type { IProcurementAnnouncement, ITor } from "../models";
import type { BlobStorage } from "../storage/storage.types";
import { streamToBuffer } from "../utils/streamToBuffer";
import { enqueue } from "./enrichment/enrichmentJobRepo";
import { gprocProjectUrl } from "./gprocUrl";
import { pdfInspect, type PdfParseFn } from "./pdfInspect";

export interface StoredInvitation {
  torId: Types.ObjectId;
  /** Storage key the invitation PDF is already stored under (the deadline step's key). */
  key: string;
  fileName: string;
  content: Buffer;
}

/**
 * Make an already-stored invitation PDF the TOR's source document when it has none yet, the same
 * fallback the capture uses when a project has no TOR file. Discovery only takes the PDF from a
 * TOR-draft announcement, so a project that went straight to its invitation was left with no
 * document (the TOR page said there was no PDF, and the AI summarised the project details only).
 *
 * Only fills an empty slot: a document set meanwhile (by a capture, say) is never replaced. A TOR
 * that is enriched or still pending is re-queued, under a hash of the new file, so the summary is
 * redone from the document; linking twice never queues twice. Returns true when it linked the file.
 */
export async function linkInvitationAsSourceDocument(
  file: StoredInvitation,
  deps: {
    storage: BlobStorage;
    parse?: PdfParseFn;
    enqueueEnrichment?: (torId: Types.ObjectId, hash: string) => Promise<void>;
  }
): Promise<boolean> {
  const tor = await Tor.findOne({ _id: file.torId, "sourceDocument.storageKey": null })
    .select("projectCode sourceListingUrl sourceContentHash pipelineStatus")
    .lean();
  if (!tor) return false;

  const sha256 = createHash("sha256").update(file.content).digest("hex");
  const { pageCount, textLayer } = await pdfInspect(file.content, deps.parse);
  const code = tor.projectCode ?? "";
  const res = await Tor.updateOne(
    { _id: file.torId, "sourceDocument.storageKey": null },
    {
      $set: {
        sourceDocument: {
          egpUrl: /^\d{11}$/.test(code) ? gprocProjectUrl(code) : (tor.sourceListingUrl ?? file.key),
          filename: file.fileName,
          storageKey: file.key,
          textLayer,
          pageCount,
          byteSize: file.content.length,
          sha256,
          fetchedAt: new Date(),
          kind: "invitation",
        },
        sourceDocumentUrl: deps.storage.publicUrl(file.key) ?? `/api/tors/${String(file.torId)}/document`,
      },
    }
  );
  if (res.matchedCount === 0) return false;

  if (tor.pipelineStatus === "enriched" || tor.pipelineStatus === "pending") {
    // The TOR's own hash is left alone: discovery compares it with egp2, and changing it would look like an edit.
    const hash = createHash("sha256").update(`${tor.sourceContentHash ?? ""}|invitation|${sha256}`).digest("hex");
    await (deps.enqueueEnrichment ?? enqueue)(file.torId, hash);
  }
  return true;
}

/** Enriched TORs with no document whose invitation PDF the deadline step already stored. */
const STORED_INVITATION_FILTER: QueryFilter<ITor> = {
  pipelineStatus: "enriched",
  "sourceDocument.storageKey": null,
  "procurement.announcements": { $elemMatch: { kind: "invitation", storageKey: { $ne: null } } },
};

export interface StoredInvitationCandidate {
  torId: Types.ObjectId;
  projectCode: string | null;
  stage: string | null;
  key: string;
}

/**
 * One-off backfill for TORs enriched before invitations were linked: give each one its latest
 * already-stored invitation PDF as its document (no e-GP download) and queue it once for
 * enrichment. With `apply: false` it only lists what it would do. One TOR's failure is reported
 * and does not stop the others.
 */
export async function linkStoredInvitations(opts: {
  apply: boolean;
  storage: BlobStorage;
  parse?: PdfParseFn;
  enqueueEnrichment?: (torId: Types.ObjectId, hash: string) => Promise<void>;
}): Promise<{ candidates: StoredInvitationCandidate[]; linked: number; failed: { projectCode: string | null; error: string }[] }> {
  const tors = await Tor.find(STORED_INVITATION_FILTER).select("projectCode procurement").sort({ _id: 1 }).lean();
  const candidates: StoredInvitationCandidate[] = tors.flatMap((t) => {
    const stored = (t.procurement?.announcements ?? []).filter(
      (a): a is IProcurementAnnouncement & { storageKey: string } => a.kind === "invitation" && Boolean(a.storageKey)
    );
    const latest = stored.sort((a, b) => (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0)).pop();
    return latest
      ? [{ torId: t._id, projectCode: t.projectCode ?? null, stage: t.procurement?.stage ?? null, key: latest.storageKey }]
      : [];
  });
  if (!opts.apply) return { candidates, linked: 0, failed: [] };

  let linked = 0;
  const failed: { projectCode: string | null; error: string }[] = [];
  for (const c of candidates) {
    try {
      const content = await streamToBuffer(await opts.storage.getStream(c.key));
      const fileName = c.key.split("/").pop() ?? "invitation.pdf";
      if (await linkInvitationAsSourceDocument({ torId: c.torId, key: c.key, fileName, content }, opts)) linked += 1;
    } catch (err) {
      failed.push({ projectCode: c.projectCode, error: (err as Error).message });
    }
  }
  return { candidates, linked, failed };
}
