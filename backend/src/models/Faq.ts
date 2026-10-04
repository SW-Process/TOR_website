import { Schema, model, type Types } from "mongoose";
import { HELP_CATEGORY_SLUGS, type HelpCategorySlug } from "../config/helpCategories";
import type { HelpStatus } from "./Announcement";

export interface IFaq {
  /** Stable key for seeded content, so re-seeding never duplicates; null for admin-written FAQs. */
  slug: string | null;
  question: string;
  /** Same light markup as announcements. */
  answer: string;
  category: HelpCategorySlug;
  /** Shown in the help-center front page's "คำถามที่พบบ่อย" list. */
  featured: boolean;
  /** Position within its category (ascending). */
  order: number;
  status: HelpStatus;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

/** faqs — help-center questions and answers admins maintain ("คำถามที่พบบ่อย"). */
const faqSchema = new Schema<IFaq>(
  {
    slug: { type: String, default: null },
    question: { type: String, required: true, trim: true, maxlength: 300 },
    answer: { type: String, required: true, maxlength: 20000 },
    category: { type: String, enum: HELP_CATEGORY_SLUGS, required: true },
    featured: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

faqSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { slug: { $type: "string" } } });
faqSchema.index({ status: 1, category: 1, order: 1 });

export const Faq = model<IFaq>("Faq", faqSchema);
export default Faq;
