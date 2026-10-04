import { Announcement, Faq } from "../models";
import { SEED_ANNOUNCEMENTS, SEED_FAQS } from "./helpContent";

const DAY_MS = 24 * 60 * 60 * 1000;

interface Counts {
  inserted: number;
  existing: number;
}

/**
 * Insert any seed announcement/FAQ whose slug isn't stored yet, published.
 * $setOnInsert keeps an existing row — admin edits and unpublishing survive.
 */
export async function seedHelpContent(now = new Date()): Promise<{ announcements: Counts; faqs: Counts }> {
  const announcementOps = SEED_ANNOUNCEMENTS.map((a) => ({
    updateOne: {
      filter: { slug: a.slug },
      update: {
        $setOnInsert: {
          slug: a.slug,
          title: a.title,
          body: a.body,
          kind: a.kind,
          pinned: a.pinned ?? false,
          status: "published" as const,
          publishedAt: new Date(now.getTime() - a.daysAgo * DAY_MS),
          endsAt: null,
        },
      },
      upsert: true,
    },
  }));
  const faqOps = SEED_FAQS.map((f) => ({
    updateOne: {
      filter: { slug: f.slug },
      update: {
        $setOnInsert: {
          slug: f.slug,
          question: f.question,
          answer: f.answer,
          category: f.category,
          featured: f.featured ?? false,
          order: f.order,
          status: "published" as const,
        },
      },
      upsert: true,
    },
  }));

  const [a, f] = await Promise.all([Announcement.bulkWrite(announcementOps), Faq.bulkWrite(faqOps)]);
  return {
    announcements: { inserted: a.upsertedCount, existing: SEED_ANNOUNCEMENTS.length - a.upsertedCount },
    faqs: { inserted: f.upsertedCount, existing: SEED_FAQS.length - f.upsertedCount },
  };
}
