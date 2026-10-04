import type { BidDeadlineResult } from "../ingestion/enrichment/torExtractor";

const BANGKOK_OFFSET = "+07:00"; // Thailand has no DST
const DEFAULT_TIME = "23:59";
const MIN_CONFIDENCE = 0.5;
const BUDDHIST_ERA_OFFSET = 543;
const BUDDHIST_ERA_YEAR_THRESHOLD = 2400;
const ISO_MONTH = /^(\d{4})-(\d{2})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Asia/Bangkok calendar day of an instant, as `YYYY-MM-DD`. */
export function bangkokDay(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok" }).format(d);
}

function instant(isoDate: string, time: string): Date | null {
  const m = ISO_DATE.exec(isoDate);
  if (!m) return null;
  const d = new Date(`${isoDate}T${time}:00${BANGKOK_OFFSET}`);
  if (Number.isNaN(d.getTime())) return null;
  // reject rollovers such as 2026-02-31 → 2026-03-03
  const back = bangkokDay(d);
  return back === isoDate ? d : null;
}

/** `YYYY-MM-DD` → 23:59 Asia/Bangkok that day, or null when it is not a real calendar date. */
export function bangkokEndOfDay(isoDate: string): Date | null {
  return instant(isoDate, DEFAULT_TIME);
}

/** `YYYY-MM` → 23:59 Asia/Bangkok on the last day of that month, or null when it is not a real month. */
export function bangkokEndOfMonth(yearMonth: string): Date | null {
  const m = ISO_MONTH.exec(yearMonth);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return instant(`${m[1]}-${m[2]}-${String(lastDay).padStart(2, "0")}`, DEFAULT_TIME);
}

export interface ResolvedBidDeadline {
  date: Date;
  precision: "day" | "month";
}

/**
 * Turn what the model read from an invitation PDF into a deadline instant, or null when it must
 * not be trusted: no/odd date, low confidence, or a date before the invitation itself was
 * published (the model picked the wrong date). A date without a time counts to the end of that
 * Bangkok day so the TOR stays open on the deadline day; a `YYYY-MM` date counts to the end of that
 * month (precision "month").
 */
export function resolveBidDeadline(
  result: BidDeadlineResult,
  opts: { notBefore?: Date | null } = {}
): ResolvedBidDeadline | null {
  if (!result.date || result.confidence < MIN_CONFIDENCE) return null;
  const buddhistToGregorian = (y: number) => (y >= BUDDHIST_ERA_YEAR_THRESHOLD ? y - BUDDHIST_ERA_OFFSET : y);
  let d: Date | null;
  let precision: "day" | "month";
  const dayMatch = ISO_DATE.exec(result.date);
  const monthMatch = ISO_MONTH.exec(result.date);
  if (dayMatch) {
    const isoDate = `${String(buddhistToGregorian(Number(dayMatch[1]))).padStart(4, "0")}-${dayMatch[2]}-${dayMatch[3]}`;
    const time = result.time && CLOCK.test(result.time) ? result.time : DEFAULT_TIME;
    d = instant(isoDate, time);
    precision = "day";
  } else if (monthMatch) {
    // only a month and year are printed: the deadline is somewhere in that month, so allow all of it
    d = bangkokEndOfMonth(`${String(buddhistToGregorian(Number(monthMatch[1]))).padStart(4, "0")}-${monthMatch[2]}`);
    precision = "month";
  } else {
    return null;
  }
  if (!d) return null;
  if (opts.notBefore && d.getTime() < opts.notBefore.getTime()) return null;
  return { date: d, precision };
}
