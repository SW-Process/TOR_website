import { formatThaiDate, type TOR, type TORStatus } from "@/lib/mockData";

/** Backend `displayStatus` → the Thai label used throughout the UI. */
export const STATUS_FROM_API: Record<string, TORStatus> = {
  draft: "ร่าง TOR",
  open: "เปิดรับ",
  closing_soon: "ใกล้ปิดรับ",
  closed: "ปิดรับแล้ว",
  awarded: "ประกาศผู้ชนะแล้ว",
  cancelled: "ยกเลิก",
};

/** Thai label for a backend announcement `kind` (Tor.procurement.announcements[].kind). */
export const ANNOUNCEMENT_KIND_LABELS: Record<string, string> = {
  "tor-draft": "ร่างขอบเขตของงาน (TOR)",
  "bidding-draft": "ร่างเอกสารประกวดราคา",
  "reference-price": "ประกาศราคากลาง",
  invitation: "ประกาศเชิญชวน",
  cancellation: "ยกเลิกประกาศเชิญชวน",
  winner: "ประกาศรายชื่อผู้ชนะ",
  plan: "แผนการจัดซื้อจัดจ้าง",
  unknown: "ประกาศอื่น",
};

/** Still taking bids: เปิดรับ or ใกล้ปิดรับ. */
export function isBiddable(status: TORStatus): boolean {
  return status === "เปิดรับ" || status === "ใกล้ปิดรับ";
}

/** Something a vendor can still act on: bidding is open, or the draft TOR is still ahead of it. */
export function isActiveOpportunity(status: TORStatus): boolean {
  return isBiddable(status) || status === "ร่าง TOR";
}

const DAY_MS = 86_400_000;

const bangkokDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok" }); // YYYY-MM-DD

/** Days since the epoch of the Asia/Bangkok calendar date of `ms`. */
function bangkokDayNumber(ms: number): number {
  const [y, m, d] = bangkokDay.format(new Date(ms)).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

/**
 * Bangkok calendar days until `iso` on the real clock (not the mock TODAY_ISO clock): 0 on the
 * deadline day while it has not yet passed, so "closes today" shows before the deadline, not after.
 * A passed deadline keeps the plain elapsed-time ceiling (<= 0).
 */
function daysFromNow(iso: string): number {
  const target = Date.parse(iso);
  const now = Date.now();
  if (target <= now) return Math.ceil((target - now) / DAY_MS);
  return bangkokDayNumber(target) - bangkokDayNumber(now);
}

/** Whole days until the real bid deadline, or null when the TOR has none known. Real clock. */
export function bidDaysLeft(tor: Pick<TOR, "procurement">): number | null {
  const bid = tor.procurement?.bidDeadline ?? null;
  return bid ? daysFromNow(bid) : null;
}

/**
 * One-line status detail for cards and tables. The only deadline it ever uses is the real
 * bid-submission deadline (`procurement.bidDeadline`), never the legacy extracted date.
 */
export function statusNote(tor: Pick<TOR, "status" | "procurement">): string {
  const bid = tor.procurement?.bidDeadline ?? null;
  switch (tor.status) {
    case "ร่าง TOR":
      return "ยังไม่ประกาศเชิญชวน";
    case "ประกาศผู้ชนะแล้ว":
      return "ประกาศผู้ชนะแล้ว";
    case "ยกเลิก":
      return "ยกเลิกการจัดซื้อ";
    case "ปิดรับแล้ว":
      return bid ? `ปิดรับเมื่อ ${formatThaiDate(bid)}` : "ปิดรับแล้ว";
    case "ใกล้ปิดรับ":
    case "เปิดรับ": {
      if (!bid) return "ไม่ระบุวันปิดรับ";
      const days = daysFromNow(bid);
      return days <= 0 ? "ปิดรับวันนี้" : `เหลือ ${days} วัน`;
    }
  }
}
