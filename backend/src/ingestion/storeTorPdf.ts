import { createHash } from "node:crypto";
import type { HydratedDocument } from "mongoose";
import type { ITor, SourceDocumentKind } from "../models/Tor";
import type { BlobStorage } from "../storage/storage.types";
import { pdfInspect, type PdfParseFn } from "./pdfInspect";

/**
 * Store a source PDF's bytes (a TOR, or an invitation when no TOR exists yet) and record everything on `tor.sourceDocument` (and `sourceDocumentUrl`).
 * Shared by the egp2 download (`fetchAndStoreTorPdf`) and the process5 capture.
 */
export async function storeTorPdf(
  tor: HydratedDocument<ITor>,
  buf: Buffer,
  meta: { egpUrl: string; filename: string; key: string; kind?: SourceDocumentKind },
  deps: { storage: BlobStorage; parse?: PdfParseFn }
): Promise<void> {
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const { pageCount, textLayer } = await pdfInspect(buf, deps.parse);
  await deps.storage.put(meta.key, buf, { contentType: "application/pdf" });
  tor.sourceDocument = {
    egpUrl: meta.egpUrl,
    filename: meta.filename,
    storageKey: meta.key,
    textLayer,
    pageCount,
    byteSize: buf.length,
    sha256,
    fetchedAt: new Date(),
    kind: meta.kind ?? "tor",
  };
  tor.sourceDocumentUrl = deps.storage.publicUrl(meta.key) ?? `/api/tors/${tor.id}/document`;
  await tor.save();
}

export default storeTorPdf;
