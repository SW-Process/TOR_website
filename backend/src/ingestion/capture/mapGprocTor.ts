import { createHash } from "node:crypto";
import type { IProcurement } from "../../models/Tor";
import type { GprocAnnouncement, GprocMoney, GprocProjectDetail } from "../../scraper/gprocClient.types";
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
 * Pure transform: process5 detail + announcement rows → what a new Tor is created from. `budget` is
 * `projectMoney` and the reference price is `priceBuild`, both from `getProcurementDetail` (`money`); without
 * it the reference price falls back to the first `priceBuild` on the announcement rows and `budget` is left
 * unset. `announcementDate` is the earliest announcement. No I/O.
 */
export function mapGprocTor(
  input: { detail: GprocProjectDetail; announcements: GprocAnnouncement[]; money?: GprocMoney | null },
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
  if (input.money?.projectMoney) set.budget = input.money.projectMoney;
  const referencePrice = input.money?.priceBuild ?? prices[0];
  if (referencePrice !== undefined) set.referencePrice = referencePrice;
  if (dates.length > 0) set.announcementDate = dates[0]; // announcements are sorted oldest first

  const hash = createHash("sha256")
    .update([title, department ?? "", agency ?? "", String(set.referencePrice ?? ""), String(set.budget ?? "")].join("|"))
    .digest("hex");
  return { set, sourceContentHash: hash, procurement, unknownCodes };
}
