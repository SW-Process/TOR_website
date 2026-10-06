/** What we read from process5's `getProjectDetail` (everything else is ignored). */
export interface GprocProjectDetail {
  projectId: string;
  /** "A" active, "R" cancelled. */
  projectStatus: string | null;
  /** The current announcement type of the project, e.g. "B0" draft tender doc, "D0" invitation, "W0" winner. */
  announceType: string | null;
  methodId: string | null;
  stepId: string | null;
}

/** One row of the "ดูข้อมูล" announcement list (`greenBook`). */
export interface GprocAnnouncement {
  announceType: string;
  /** ISO instant, e.g. "2026-10-05T17:00:00.000Z" (= 6 Oct in Bangkok). */
  announceDate: string | null;
  announceFlag: string | null;
}

export interface GprocClientLike {
  /** Null when e-GP has no such project. */
  projectDetail(projectId: string): Promise<GprocProjectDetail | null>;
  announcements(projectId: string, detail: GprocProjectDetail): Promise<GprocAnnouncement[]>;
  /** The signed invitation PDF, or null when the project has none (yet). */
  invitationPdf(projectId: string): Promise<Buffer | null>;
}
