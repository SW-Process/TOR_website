import { createHash } from "node:crypto";
import type { IProcurement } from "../../models/Tor";
import type { GprocAnnouncement, GprocProjectDetail } from "../../scraper/gprocClient.types";
import { buildGprocProcurement } from "../gprocMap";

export interface MappedGprocTor {
  set: {
    title: string;
    agency?: string;
    department?: string;
    budget?: number;
    referencePrice?: number;
    announcementDate?: Date;
  };
  sourceContentHash: string;
  procurement: IProcurement;
  unknownCodes: string[];
}

const text = (v: string | null | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

/**
 * Pure transform: process5 detail + announcement rows → what a new Tor is created from. The reference
 * price is the first `priceBuild` on the rows; `announcementDate` is the earliest announcement. process5
 * gives no budget, so `budget` is never set. No I/O.
 */
export function mapGprocTor(
  input: { detail: GprocProjectDetail; announcements: GprocAnnouncement[] },
  now: Date
): MappedGprocTor | null {
  const title = text(input.detail.projectName);
  if (!title) return null;
  const { procurement, unknownCodes } = buildGprocProcurement(input, undefined, now);

  const prices = input.announcements.map((a) => a.priceBuild).filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  const dates = procurement.announcements.map((a) => a.publishedAt).filter((d): d is Date => d instanceof Date);
  const set: MappedGprocTor["set"] = { title };
  const agency = text(input.detail.deptSubName);
  const department = text(input.detail.deptName);
  if (agency) set.agency = agency;
  if (department) set.department = department;
  if (prices.length > 0) set.referencePrice = prices[0];
  if (dates.length > 0) set.announcementDate = dates[0]; // announcements are sorted oldest first

  const hash = createHash("sha256")
    .update([title, department ?? "", agency ?? "", String(set.referencePrice ?? "")].join("|"))
    .digest("hex");
  return { set, sourceContentHash: hash, procurement, unknownCodes };
}
