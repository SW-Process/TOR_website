import type { AnnouncementKind, IProcurementAnnouncement, ProcurementStage } from "../models/Tor";

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
