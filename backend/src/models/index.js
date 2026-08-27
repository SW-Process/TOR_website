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
module.exports = {
  User: require("./User"),
  VendorProfile: require("./VendorProfile"),
  Tor: require("./Tor"),
  Bookmark: require("./Bookmark"),
  Notification: require("./Notification"),
  ErrorReport: require("./ErrorReport"),
  IngestionRun: require("./IngestionRun"),
  SystemLog: require("./SystemLog"),
};
