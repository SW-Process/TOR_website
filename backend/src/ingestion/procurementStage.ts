import type { EgpAnnouncement } from "../scraper/egpClient.types";
import type {
  AnnouncementKind,
  IProcurement,
  IProcurementAnnouncement,
  ProcurementStage,
} from "../models/Tor";

const CANCELLED_CONTRACT_STATUS = "ยกเลิกโครงการ";

/** Map an e-GP `masterAnnounceTypeName` onto our fixed set of announcement kinds. */
export function classifyAnnouncement(typeName: string | null | undefined): AnnouncementKind {
  const name = typeName?.trim() ?? "";
  if (name === "" || name === "ไม่ระบุ") return "unknown";
  if (name.startsWith("ยกเลิก")) return "cancellation";
  if (name.startsWith("ร่างขอบเขตของงาน")) return "tor-draft";
  if (name.startsWith("ร่างเอกสารประกวดราคา")) return "bidding-draft";
  if (name.startsWith("ประกาศเชิญชวน")) return "invitation";
  if (name.includes("ผู้ชนะ") || name.includes("ผู้ได้รับการคัดเลือก")) return "winner";
  if (name.includes("ราคากลาง")) return "reference-price";
  if (name.startsWith("แผนการจัดซื้อ")) return "plan";
  return "unknown";
}

type StageInput = Pick<IProcurementAnnouncement, "kind" | "publishedAt">;

const timeOf = (a: StageInput): number => a.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;

/**
 * Is `a` a later invitation-related event than `best`? A missing date sorts earliest. On an
 * exact tie the invitation wins, so a same-day cancel + re-invite is not read as cancelled
 * (e-GP publish dates are day-granular).
 */
function isLater(a: StageInput, best: StageInput): boolean {
  const ta = timeOf(a);
  const tb = timeOf(best);
  return ta > tb || (ta === tb && a.kind === "invitation");
}

/**
 * Where the project sits in the procurement lifecycle. Precedence: cancelled → awarded →
 * inviting → draft. `unknown` announcements never decide anything.
 */
export function deriveStage(
  announcements: ReadonlyArray<StageInput>,
  contractStatus: string | null | undefined
): ProcurementStage {
  if (contractStatus?.trim() === CANCELLED_CONTRACT_STATUS) return "cancelled";

  const invitationEvents = announcements.filter((a) => a.kind === "invitation" || a.kind === "cancellation");
  const latest = invitationEvents.reduce<StageInput | null>(
    (best, a) => (best === null || isLater(a, best) ? a : best),
    null
  );
  if (latest?.kind === "cancellation") return "cancelled";

  if (announcements.some((a) => a.kind === "winner")) return "awarded";
  if (announcements.some((a) => a.kind === "invitation")) return "inviting";
  return "draft";
}

function parsePublishDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function compareByDate(a: IProcurementAnnouncement, b: IProcurementAnnouncement): number {
  const ta = a.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const tb = b.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  return ta === tb ? 0 : ta < tb ? -1 : 1;
}

/**
 * Pure transform: e-GP announcements + contract status → a fresh `procurement` payload.
 * Announcements are stored oldest first (undated first) for the detail-page timeline.
 */
export function buildProcurement(
  announcements: EgpAnnouncement[],
  contractStatus: string | null | undefined,
  now: Date
): IProcurement {
  // An announcement without an id cannot be stored (id is required) and must never block a TOR.
  const items: IProcurementAnnouncement[] = announcements
    .filter((a) => Boolean(a.id?.trim()))
    .map((a) => ({
      announcementId: a.id,
      typeName: a.masterAnnounceTypeName?.trim() || undefined,
      kind: classifyAnnouncement(a.masterAnnounceTypeName),
      publishedAt: parsePublishDate(a.projectAnnouncementPublishDate),
      hasFile: Boolean(a.projectAnnouncementPath),
    }))
    .sort(compareByDate); // Array#sort is stable, so equal dates keep e-GP's order

  return {
    stage: deriveStage(items, contractStatus),
    contractStatus: contractStatus?.trim() || undefined,
    announcements: items,
    lastCheckedAt: now,
  };
}

/**
 * Apply a fresh payload over what is stored, keeping the fields other pipeline stages own:
 * `bidDeadline` (invitation-PDF extraction / admin edit) and each announcement's `storageKey`.
 */
export function mergeProcurement(
  existing: IProcurement | null | undefined,
  fresh: IProcurement
): IProcurement {
  const storedKeys = new Map(
    (existing?.announcements ?? []).map((a) => [a.announcementId, a.storageKey ?? null])
  );
  return {
    ...fresh,
    announcements: fresh.announcements.map((a) => ({
      ...a,
      storageKey: storedKeys.get(a.announcementId) ?? null,
    })),
    bidDeadline: existing?.bidDeadline ?? null,
  };
}
