import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { Announcement, Faq } from "../models";
import type { IAnnouncement, IFaq } from "../models";
import { HELP_CATEGORIES, HELP_CATEGORY_SLUGS } from "../config/helpCategories";
import { escapeRegExp } from "../utils/escapeRegExp";
import { httpError } from "../utils/httpError";

/**
 * Public help center ("ศูนย์ช่วยเหลือ"): published announcements and FAQs only.
 * Drafts never leave the admin API.
 */

const PUBLISHED = { status: "published" } as const;
/** Announcements on the help-center front page. */
const FRONT_PAGE_ANNOUNCEMENTS = 5;
/** Featured FAQs on the help-center front page. */
const FRONT_PAGE_FAQS = 8;
/** Other questions shown under an FAQ. */
const RELATED_FAQS = 5;

type Lean<T> = T & { _id: unknown };

function isEnded(a: Pick<IAnnouncement, "endsAt">, now: Date): boolean {
  return a.endsAt !== null && a.endsAt !== undefined && a.endsAt <= now;
}

function announcementSummary(a: Lean<IAnnouncement>, now: Date) {
  return {
    id: String(a._id),
    title: a.title,
    kind: a.kind,
    pinned: a.pinned,
    ended: isEnded(a, now),
    publishedAt: a.publishedAt,
  };
}

function faqSummary(f: Lean<IFaq>) {
  return { id: String(f._id), question: f.question, category: f.category };
}

/**
 * Pinned and still-running posts first, then newest. Ended posts sink even when
 * pinned, the way LINE's help center lists "[สิ้นสุด]" notices last.
 */
function sortAnnouncements<T extends Lean<IAnnouncement>>(rows: T[], now: Date): T[] {
  const rank = (a: T) => (isEnded(a, now) ? 2 : a.pinned ? 0 : 1);
  return [...rows].sort(
    (a, b) => rank(a) - rank(b) || (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0)
  );
}

/** GET /api/help — the help-center front page in one request. */
export async function getHelpHome(_req: Request, res: Response): Promise<void> {
  const now = new Date();
  const [announcements, featured, counts] = await Promise.all([
    Announcement.find(PUBLISHED).lean<Lean<IAnnouncement>[]>(),
    Faq.find({ ...PUBLISHED, featured: true }).sort({ order: 1, _id: 1 }).limit(FRONT_PAGE_FAQS).lean<Lean<IFaq>[]>(),
    Faq.aggregate<{ _id: string; count: number }>([
      { $match: PUBLISHED },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]),
  ]);
  const countBySlug = new Map(counts.map((c) => [c._id, c.count]));

  res.status(200).json({
    categories: HELP_CATEGORIES.map((c) => ({ ...c, count: countBySlug.get(c.slug) ?? 0 })),
    announcements: sortAnnouncements(announcements, now)
      .slice(0, FRONT_PAGE_ANNOUNCEMENTS)
      .map((a) => announcementSummary(a, now)),
    announcementCount: announcements.length,
    faqs: featured.map(faqSummary),
  });
}

/** GET /api/help/announcements — every published announcement, in front-page order. */
export async function listAnnouncements(_req: Request, res: Response): Promise<void> {
  const now = new Date();
  const rows = await Announcement.find(PUBLISHED).lean<Lean<IAnnouncement>[]>();
  res.status(200).json({ data: sortAnnouncements(rows, now).map((a) => announcementSummary(a, now)) });
}

/** GET /api/help/announcements/:id — one published announcement with its body. */
export async function getAnnouncement(req: Request, res: Response): Promise<void> {
  if (!isValidObjectId(req.params.id)) throw httpError(404, "Announcement not found");
  const a = await Announcement.findOne({ _id: req.params.id, ...PUBLISHED }).lean<Lean<IAnnouncement>>();
  if (!a) throw httpError(404, "Announcement not found");
  const now = new Date();
  res.status(200).json({ announcement: { ...announcementSummary(a, now), body: a.body, endsAt: a.endsAt, updatedAt: a.updatedAt } });
}

const faqQuerySchema = z.object({
  category: z.enum(HELP_CATEGORY_SLUGS).optional(),
  q: z.string().trim().max(100).optional(),
});

/**
 * GET /api/help/faqs?category=&q= — published FAQs, by category order. `q` is a
 * case-insensitive literal match on the question and answer (no $text: Thai has
 * no word spaces, same RULING as the TOR search).
 */
export async function listFaqs(req: Request, res: Response): Promise<void> {
  const parsed = faqQuerySchema.safeParse(req.query);
  if (!parsed.success) throw httpError(400, parsed.error.issues.map((i) => i.message).join("; "));
  const { category, q } = parsed.data;

  const filter: Record<string, unknown> = { ...PUBLISHED };
  if (category) filter.category = category;
  if (q) {
    const re = { $regex: escapeRegExp(q), $options: "i" };
    filter.$or = [{ question: re }, { answer: re }];
  }
  const rows = await Faq.find(filter).lean<Lean<IFaq>[]>();
  const categoryOrder = new Map<string, number>(HELP_CATEGORY_SLUGS.map((s, i) => [s, i]));
  rows.sort(
    (a, b) =>
      (categoryOrder.get(a.category) ?? 0) - (categoryOrder.get(b.category) ?? 0) ||
      a.order - b.order ||
      String(a._id).localeCompare(String(b._id))
  );
  res.status(200).json({ data: rows.map(faqSummary) });
}

/** GET /api/help/faqs/:id — one published FAQ with its answer and related questions. */
export async function getFaq(req: Request, res: Response): Promise<void> {
  if (!isValidObjectId(req.params.id)) throw httpError(404, "FAQ not found");
  const f = await Faq.findOne({ _id: req.params.id, ...PUBLISHED }).lean<Lean<IFaq>>();
  if (!f) throw httpError(404, "FAQ not found");
  const related = await Faq.find({ ...PUBLISHED, category: f.category, _id: { $ne: f._id } })
    .sort({ order: 1, _id: 1 })
    .limit(RELATED_FAQS)
    .lean<Lean<IFaq>[]>();
  res.status(200).json({ faq: { ...faqSummary(f), answer: f.answer, updatedAt: f.updatedAt }, related: related.map(faqSummary) });
}
