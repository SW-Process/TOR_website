import { emailMatchDigests } from "./matchDigestEmails";
import { notifyProfileMatches } from "./profileMatchNotifications";
import { notifySavedSearchMatches } from "./savedSearchMatchNotifications";

/**
 * Everything a vendor hears about the TORs an enrichment run just enriched: in-app
 * profile_match and saved_search_match notifications (FR-30), then one email digest
 * per vendor of what was created (FR-29). Never throws.
 */
export async function notifyMatches(torIds: string[] | undefined | null): Promise<void> {
  const created = [...(await notifyProfileMatches(torIds)), ...(await notifySavedSearchMatches(torIds))];
  await emailMatchDigests(created);
}
