/**
 * Central export for all Mongoose models.
 *
 * Collections:
 *   users          — Vendor + Admin identities (public users have no account)
 *   vendorprofiles — 1:1 with a vendor user; FR-22 business profile + saved searches
 *   tors           — central TOR entity; embeds aiSummary + fairnessFlags
 *   bookmarks      — vendor↔TOR join + application status
 *   notifications  — in-app match notifications
 *   errorreports   — public/vendor-submitted TOR error reports
 *   ingestionruns  — sync run history
 *   systemlogs     — diagnostic logs
 */
export { User } from "./User";
export { VendorProfile } from "./VendorProfile";
export { Tor } from "./Tor";
export { Bookmark } from "./Bookmark";
export { Notification } from "./Notification";
export { ErrorReport } from "./ErrorReport";
export { IngestionRun } from "./IngestionRun";
export { SystemLog } from "./SystemLog";

export type { IUser, UserRole, UserDocument } from "./User";
export type { IVendorProfile, ISavedSearch } from "./VendorProfile";
export type { ITor, IAiSummary, IFairnessFlag } from "./Tor";
export type { IBookmark, ApplicationStatus } from "./Bookmark";
export type { INotification, NotificationType } from "./Notification";
export type { IErrorReport } from "./ErrorReport";
export type { IIngestionRun } from "./IngestionRun";
export type { ISystemLog } from "./SystemLog";
