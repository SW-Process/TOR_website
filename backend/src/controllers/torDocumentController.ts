import type { Request, Response } from "express";
import { Tor } from "../models";
import { getStorage } from "../storage";
import { httpError } from "../utils/httpError";

/** GET /api/tors/:id/document — stream our stored copy of the TOR PDF (FR-05). */
export async function streamTorDocument(req: Request, res: Response): Promise<void> {
  const tor = await Tor.findById(req.params.id).lean();
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
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}
