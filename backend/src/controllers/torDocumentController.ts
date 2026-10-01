import type { Request, Response } from "express";
import { Tor } from "../models";
import { getStorage } from "../storage";
import { httpError } from "../utils/httpError";

/** GET /api/tors/:id/document — stream our stored copy of the TOR PDF (FR-05). */
export async function streamTorDocument(req: Request, res: Response): Promise<void> {
  // Spec §12: the public API only exposes enriched TORs.
  const tor = await Tor.findOne({ _id: req.params.id, pipelineStatus: "enriched" }).lean();
  const key = tor?.sourceDocument?.storageKey;
  if (!tor || !key) throw httpError(404, "No stored document for this TOR");

  let stream: NodeJS.ReadableStream;
  try {
    stream = await getStorage().getStream(key);
  } catch {
    throw httpError(404, "Stored document is unavailable");
  }

  const filename = encodeURIComponent(tor.sourceDocument?.filename ?? "tor.pdf");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  // GCS read streams are lazy: auth / not-found errors only surface here, after
  // the handler returned. If nothing has been sent yet, answer with a real error
  // instead of dropping the socket (which browsers show as "server unreachable").
  stream.on("error", (err) => {
    console.error(`[tor-document] stream failed for ${key}:`, err);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.removeHeader("Content-Disposition");
    res.status(502).json({ message: "Stored document is unavailable" });
  });
  stream.pipe(res);
}
