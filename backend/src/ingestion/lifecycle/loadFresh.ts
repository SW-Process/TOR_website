import type { IProcurement, IProcurementAnnouncement } from "../../models";
import type { EgpClientLike } from "../../scraper/egpClient.types";
import type { GprocClientLike } from "../../scraper/gprocClient.types";
import { buildGprocProcurement } from "../gprocMap";
import { buildProcurement } from "../procurementStage";
import { projectIdFromListingUrl } from "./candidates";
import type { LoadedInvitationPdf } from "./deadlineStep";

export type GprocAttempt = "ok" | "not-found" | "error";

export interface LoadFreshTor {
  projectCode?: string | null;
  sourceListingUrl?: string | null;
  procurement?: IProcurement | null;
}

export interface FreshProcurement {
  fresh: IProcurement;
  source: "gproc" | "egp2";
  /** egp2: announcementId → file name (the deadline step downloads through the egp2 client). */
  filenames?: Map<string, string>;
  /** process5: loads the signed invitation PDF. */
  loadPdf?: (invitation: IProcurementAnnouncement) => Promise<LoadedInvitationPdf | null>;
}

/**
 * One TOR's fresh `procurement`: the national e-GP (process5) first, the BMA portal (egp2) as the
 * fallback when process5 does not know the project or fails. Returns "skip" when neither can be asked.
 * `warn` receives human-readable notes (a process5 failure, unknown announce codes).
 */
export async function loadFreshProcurement(args: {
  tor: LoadFreshTor;
  egp: EgpClientLike;
  gproc?: GprocClientLike;
  now: () => Date;
  warn: (message: string) => Promise<void>;
  /** Called once when process5 was asked: it answered, did not know the project, or failed. */
  report?: (attempt: GprocAttempt) => void;
}): Promise<FreshProcurement | "skip"> {
  const { tor, egp, gproc, now, warn, report } = args;
  const code = tor.projectCode ?? undefined;

  if (gproc && code && /^\d{11}$/.test(code)) {
    try {
      const detail = await gproc.projectDetail(code);
      if (detail) {
        const rows = await gproc.announcements(code, detail);
        // An empty list for a project that had announcements means process5 changed shape: use egp2.
        if (rows.length === 0 && (tor.procurement?.announcements?.length ?? 0) > 0) {
          throw new Error("process5 returned no announcements for a project that had some");
        }
        // process5 does not expose the contract status: read it best-effort from egp2, else carry the stored one.
        let contractStatus = tor.procurement?.contractStatus ?? undefined;
        const egpProjectId = projectIdFromListingUrl(tor.sourceListingUrl);
        if (egpProjectId) {
          try {
            const d = await egp.projectDetail(egpProjectId);
            if (d.masterContractAvailableName) contractStatus = d.masterContractAvailableName;
          } catch {
            // best-effort only
          }
        }
        const { procurement, unknownCodes } = buildGprocProcurement(
          { detail, announcements: rows },
          contractStatus,
          now()
        );
        report?.("ok");
        for (const c of unknownCodes) await warn(`TOR ${code}: unknown process5 announce type "${c}" (treated as unknown)`);
        return {
          fresh: procurement,
          source: "gproc",
          loadPdf: async () => {
            const content = await gproc.invitationPdf(code);
            return content ? { content, fileName: `${code}-invitation.pdf` } : null;
          },
        };
      }
      report?.("not-found");
    } catch (err) {
      report?.("error");
      await warn(`TOR ${code}: process5 failed (${(err as Error).message}); using the BMA portal instead`);
    }
  }

  const projectId = projectIdFromListingUrl(tor.sourceListingUrl);
  if (!projectId) return "skip";
  const detail = await egp.projectDetail(projectId);
  const announcements = await egp.announcements(projectId);
  const fresh = buildProcurement(announcements, detail.masterContractAvailableName, now());
  fresh.source = "egp2";
  return {
    fresh,
    source: "egp2",
    filenames: new Map(
      announcements.flatMap((a) => (a.id && a.projectAnnouncementPath ? [[a.id, a.projectAnnouncementPath] as const] : []))
    ),
  };
}
