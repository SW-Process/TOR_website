import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { Announcement, Faq } from "../models";
import { HELP_CATEGORY_SLUGS } from "../config/helpCategories";
import { httpError } from "../utils/httpError";

/**
 * Admin side of the help center: write, publish, unpublish and delete
 * announcements and FAQs. Drafts are visible only here.
 */

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) throw httpError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return parsed.data;
}

function idParam(req: Request): string {
  const id = String(req.params.id);
  if (!isValidObjectId(id)) throw httpError(400, "Invalid id");
  return id;
}

const status = z.enum(["draft", "published"]);
const isoDateOrNull = z.union([z.string().datetime({ offset: true }), z.null()]);

const announcementFields = {
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(1).max(20000),
  kind: z.enum(["news", "update", "maintenance"]),
  pinned: z.boolean(),
  status,
  endsAt: isoDateOrNull,
};
const announcementCreate = z.object(announcementFields).partial({ kind: true, pinned: true, status: true, endsAt: true }).strict();
const announcementUpdate = z.object(announcementFields).partial().strict();

const faqFields = {
  question: z.string().trim().min(3).max(300),
  answer: z.string().trim().min(1).max(20000),
  category: z.enum(HELP_CATEGORY_SLUGS),
  featured: z.boolean(),
  order: z.number().int().min(0).max(100000),
  status,
};
const faqCreate = z.object(faqFields).partial({ featured: true, order: true, status: true }).strict();
const faqUpdate = z.object(faqFields).partial().strict();

/** Map a validated body onto the stored shape (dates parsed). */
function toDoc<T extends { endsAt?: string | null }>(body: T) {
  const { endsAt, ...rest } = body;
  return endsAt === undefined ? rest : { ...rest, endsAt: endsAt === null ? null : new Date(endsAt) };
}

/** publishedAt is stamped the first time a post goes live and kept through later edits. */
function publishStamp(nextStatus: string | undefined, current: { publishedAt: Date | null } | null) {
  return nextStatus === "published" && !current?.publishedAt ? { publishedAt: new Date() } : {};
}

/* ------------------------------ announcements ------------------------------ */

/**
 * GET /api/admin/help/announcements — all posts: drafts first (newest edit first),
 * then published ones pinned → newest, like the public list.
 */
export async function adminListAnnouncements(_req: Request, res: Response): Promise<void> {
  // "draft" sorts before "published"; drafts have no publishedAt, so updatedAt orders them.
  const rows = await Announcement.find().sort({ status: 1, pinned: -1, publishedAt: -1, updatedAt: -1, _id: -1 }).lean();
  res.status(200).json({ data: rows.map((a) => ({ ...a, id: String(a._id) })) });
}

/** POST /api/admin/help/announcements */
export async function adminCreateAnnouncement(req: Request, res: Response): Promise<void> {
  const body = parse(announcementCreate, req.body);
  const doc = await Announcement.create({
    ...toDoc(body),
    ...publishStamp(body.status, null),
    createdBy: req.user!.id,
    updatedBy: req.user!.id,
  });
  res.status(201).json({ announcement: { ...doc.toObject(), id: doc.id } });
}

/** PATCH /api/admin/help/announcements/:id */
export async function adminUpdateAnnouncement(req: Request, res: Response): Promise<void> {
  const id = idParam(req);
  const body = parse(announcementUpdate, req.body);
  const current = await Announcement.findById(id).select("publishedAt").lean();
  if (!current) throw httpError(404, "Announcement not found");
  const doc = await Announcement.findByIdAndUpdate(
    id,
    { $set: { ...toDoc(body), ...publishStamp(body.status, current), updatedBy: req.user!.id } },
    { returnDocument: "after", runValidators: true }
  ).lean();
  res.status(200).json({ announcement: { ...doc!, id: String(doc!._id) } });
}

/** DELETE /api/admin/help/announcements/:id */
export async function adminDeleteAnnouncement(req: Request, res: Response): Promise<void> {
  const { deletedCount } = await Announcement.deleteOne({ _id: idParam(req) });
  if (!deletedCount) throw httpError(404, "Announcement not found");
  res.status(204).end();
}

/* ---------------------------------- FAQs ----------------------------------- */

/** GET /api/admin/help/faqs — all FAQs, drafts included, in category/order. */
export async function adminListFaqs(_req: Request, res: Response): Promise<void> {
  const rows = await Faq.find().sort({ category: 1, order: 1, _id: 1 }).lean();
  res.status(200).json({ data: rows.map((f) => ({ ...f, id: String(f._id) })) });
}

/** POST /api/admin/help/faqs */
export async function adminCreateFaq(req: Request, res: Response): Promise<void> {
  const body = parse(faqCreate, req.body);
  const doc = await Faq.create({ ...body, createdBy: req.user!.id, updatedBy: req.user!.id });
  res.status(201).json({ faq: { ...doc.toObject(), id: doc.id } });
}

/** PATCH /api/admin/help/faqs/:id */
export async function adminUpdateFaq(req: Request, res: Response): Promise<void> {
  const id = idParam(req);
  const body = parse(faqUpdate, req.body);
  const doc = await Faq.findByIdAndUpdate(
    id,
    { $set: { ...body, updatedBy: req.user!.id } },
    { returnDocument: "after", runValidators: true }
  ).lean();
  if (!doc) throw httpError(404, "FAQ not found");
  res.status(200).json({ faq: { ...doc, id: String(doc._id) } });
}

/** DELETE /api/admin/help/faqs/:id */
export async function adminDeleteFaq(req: Request, res: Response): Promise<void> {
  const { deletedCount } = await Faq.deleteOne({ _id: idParam(req) });
  if (!deletedCount) throw httpError(404, "FAQ not found");
  res.status(204).end();
}
