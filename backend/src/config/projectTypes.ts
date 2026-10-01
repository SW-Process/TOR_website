/**
 * FR-6 project types: what kind of engagement a TOR is, orthogonal to the
 * subject-matter `category` taxonomy. Stored on `Tor.projectType`.
 *
 * Nothing populates `projectType` yet — the enrichment stage still has to
 * extract it — so filtering on these returns no rows until it does. Keep in
 * sync with PROJECT_TYPE_LABELS in frontend/src/lib/torSearch.ts.
 */
export const PROJECT_TYPES = [
  "new-development",
  "enhancement",
  "maintenance",
  "license-purchase",
  "hardware-purchase",
  "consulting",
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];
