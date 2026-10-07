import type { HydratedDocument, Types } from "mongoose";
import type { ITor } from "../models/Tor";
import type { EgpClientLike } from "../scraper/egpClient.types";
import type { BlobStorage } from "../storage/storage.types";
import type { PdfParseFn } from "./pdfInspect";
import { storeTorPdf } from "./storeTorPdf";
import { logIngestionEvent } from "./log";
import type { TorAnnouncementRef } from "./mapProject";

export interface FetchTorPdfDeps {
  client: EgpClientLike;
  storage: BlobStorage;
  parse?: PdfParseFn;
}

/**
 * Download the TOR PDF for `tor`, inspect its text layer, store the bytes, and
 * record everything on `tor.sourceDocument`. A fetch failure is recorded (the
 * record is marked "missing" per FR-11) rather than thrown.
 */
export async function fetchAndStoreTorPdf(
  tor: HydratedDocument<ITor>,
  ann: TorAnnouncementRef,
  ingestionRunId: Types.ObjectId,
  deps: FetchTorPdfDeps
): Promise<void> {
  const now = new Date();
  let buf: Buffer;
  try {
    buf = await deps.client.downloadFile(ann.announcementId, ann.filename);
  } catch (err) {
    tor.sourceDocument = {
      egpUrl: ann.egpUrl,
      filename: ann.filename,
      storageKey: null,
      textLayer: "missing",
      pageCount: null,
      byteSize: null,
      sha256: null,
      fetchedAt: now,
    };
    await tor.save();
    await logIngestionEvent({
      severity: "error",
      message: `TOR pdf download failed for ${tor.projectCode ?? tor.id}: ${(err as Error).message}`,
      component: "fetchAndStoreTorPdf",
      context: { announcementId: ann.announcementId },
      ingestionRunId,
    });
    return;
  }

  await storeTorPdf(
    tor,
    buf,
    { egpUrl: ann.egpUrl, filename: ann.filename, key: `tor-pdfs/${tor.projectCode ?? tor.id}/${ann.announcementId}.pdf` },
    { storage: deps.storage, parse: deps.parse }
  );
}

export default fetchAndStoreTorPdf;
