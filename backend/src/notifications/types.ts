import type { Types } from "mongoose";

/** A match notification row just created by an enrichment run, as handed to the email digest. */
export interface CreatedMatchNotification {
  vendorId: Types.ObjectId;
  torId: Types.ObjectId;
  type: "profile_match" | "saved_search_match";
  savedSearchId: Types.ObjectId | null;
}
