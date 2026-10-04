/**
 * Seed the help center with starter announcements and FAQs (scripts/helpContent.ts).
 *
 *   npm run seed:help
 *
 * Idempotent and non-destructive: inserts only slugs that aren't in the database
 * yet, so it never overwrites or re-publishes content an admin has edited
 * or unpublished. (A seed row an admin deleted does come back on a re-run.)
 */
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { seedHelpContent } from "./seedHelpContent";

async function main(): Promise<void> {
  await connectDB();
  const result = await seedHelpContent();
  console.log(
    `announcements: ${result.announcements.inserted} added, ${result.announcements.existing} already there\n` +
      `faqs: ${result.faqs.inserted} added, ${result.faqs.existing} already there`
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
