import type { AnnouncementKind, IProcurement, IProcurementAnnouncement } from "../models/Tor";
import type { GprocAnnouncement, GprocProjectDetail } from "../scraper/gprocClient.types";
import { bangkokDay } from "../utils/bidDeadline";
import { deriveStage } from "./procurementStage";

const BY_CODE: Record<string, { kind: AnnouncementKind; label: string; hasFile: boolean }> = {
  B0: { kind: "bidding-draft", label: "ร่างเอกสารประกวดราคา", hasFile: false },
  D0: { kind: "invitation", label: "ประกาศเชิญชวน", hasFile: true },
  D1: { kind: "cancellation", label: "ยกเลิกประกาศเชิญชวน", hasFile: false },
  P0: { kind: "plan", label: "แผนการจัดซื้อจัดจ้าง", hasFile: false },
  W0: { kind: "winner", label: "ประกาศผู้ชนะ", hasFile: false },
  price: { kind: "reference-price", label: "ประกาศราคากลาง", hasFile: false },
};
/** Rows that are attachments, not announcements. */
const IGNORED = new Set(["BOQ"]);

/** `gproc-D0-20260923`: stable per code + Bangkok day, and free of characters that break a file name. */
export function gprocAnnouncementId(code: string, announceDate: string | null): string {
  const t = announceDate ? Date.parse(announceDate) : NaN;
  const day = Number.isNaN(t) ? "undated" : bangkokDay(new Date(t)).replace(/-/g, "");
  return `gproc-${code}-${day}`;
}

const timeOf = (a: IProcurementAnnouncement): number => a.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;

/**
 * Pure transform: the national e-GP's project detail + announcement list → a fresh `procurement`.
 * `contractStatus` is passed through (process5's calls here do not expose it), so the caller
 * hands over the stored value. Stage rules are the shared ones; `projectStatus "R"` means cancelled.
 */
export function buildGprocProcurement(
  input: { detail: GprocProjectDetail; announcements: GprocAnnouncement[] },
  contractStatus: string | undefined,
  now: Date
): { procurement: IProcurement; unknownCodes: string[] } {
  const unknownCodes: string[] = [];
  const items: IProcurementAnnouncement[] = [];
  for (const a of input.announcements) {
    if (IGNORED.has(a.announceType)) continue;
    const known = Object.hasOwn(BY_CODE, a.announceType) ? BY_CODE[a.announceType] : undefined;
    if (!known && !unknownCodes.includes(a.announceType)) unknownCodes.push(a.announceType);
    const t = a.announceDate ? Date.parse(a.announceDate) : NaN;
    items.push({
      announcementId: gprocAnnouncementId(a.announceType, a.announceDate),
      typeName: known?.label ?? a.announceType,
      kind: known?.kind ?? "unknown",
      publishedAt: Number.isNaN(t) ? undefined : new Date(t),
      hasFile: known?.hasFile ?? false,
    });
  }
  items.sort((x, y) => (timeOf(x) === timeOf(y) ? 0 : timeOf(x) < timeOf(y) ? -1 : 1)); // stable: ties keep e-GP order

  const stage = input.detail.projectStatus === "R" ? "cancelled" : deriveStage(items, contractStatus);
  return {
    procurement: {
      stage,
      contractStatus: contractStatus?.trim() || undefined,
      announcements: items,
      lastCheckedAt: now,
      source: "gproc",
    },
    unknownCodes,
  };
}
