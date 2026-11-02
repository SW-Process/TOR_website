/**
 * One-off backfill: TORs enriched with no document whose invitation PDF is already stored get that
 * PDF as their document and are queued once for enrichment (one Gemini call each, in the next
 * enrichment run). Lists what it would do unless `--apply` is given.
 *
 *   npm run link-stored-invitations            # dry run
 *   npm run link-stored-invitations -- --apply
 */
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { linkStoredInvitations } from "../ingestion/linkInvitationDocument";
import { getStorage } from "../storage";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  await connectDB();
  const { candidates, linked, failed } = await linkStoredInvitations({ apply, storage: getStorage() });

  for (const c of candidates) console.log(`${c.projectCode ?? c.torId} (${c.stage ?? "no stage"}): ${c.key}`);
  if (!apply) {
    console.log(`\n${candidates.length} TOR(s) would get their invitation PDF as document. Run with --apply to do it.`);
  } else {
    console.log(`\nLinked ${linked} of ${candidates.length}; queued for enrichment.`);
    for (const f of failed) console.error(`failed ${f.projectCode}: ${f.error}`);
  }
  await mongoose.disconnect();
  if (failed.length > 0) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
