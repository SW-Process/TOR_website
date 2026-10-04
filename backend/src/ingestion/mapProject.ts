import { createHash } from "node:crypto";
import type {
  EgpAnnouncement,
  EgpProjectDetail,
  EgpSearchProject,
} from "../scraper/egpClient.types";
import type { IProcurement } from "../models/Tor";
import { buildProcurement } from "./procurementStage";

export interface TorAnnouncementRef {
  announcementId: string;
  filename: string;
  egpUrl: string;
  publishedAt: Date | null;
}

export interface MappedProjectSet {
  title: string;
  agency?: string;
  department?: string;
  budget?: number;
  referencePrice?: number;
  announcementDate?: Date;
  sourceListingUrl: string;
  procurementMethod?: string;
  procurementType?: string;
  goodsCategory?: string;
}

export interface MappedProject {
  projectCode: string;
  sourceContentHash: string;
  /** The pre-procurement-stage hash (also covered contract status); see runIngestion. */
  legacySourceContentHash: string;
  set: MappedProjectSet;
  procurement: IProcurement;
  torAnnouncement: TorAnnouncementRef | null;
  ingestErrors: string[];
}

const TOR_KIND_PREFIX = "ร่างขอบเขตของงาน";

function sha256OfFields(fields: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex");
}

function coreDetailFields(detail: EgpProjectDetail): unknown[] {
  return [
    detail.projectName,
    detail.masterOrgGroupName,
    detail.masterOrgDepartmentName,
    detail.projectBudget,
    detail.projectAverageBudget,
    detail.masterMethodIdName,
    detail.masterTypeIdName,
    detail.masterGoodsIdName,
  ];
}

/**
 * sha256 of the detail fields we persist, with a fixed key order. Deliberately excludes the
 * contract status: it changes as a project progresses and must not re-trigger AI enrichment
 * (it lives on `Tor.procurement` instead).
 */
export function canonicalDetailHash(detail: EgpProjectDetail): string {
  return sha256OfFields(coreDetailFields(detail));
}

/** The hash stored before procurement stages existed: the core fields plus contract status. */
export function legacyDetailHash(detail: EgpProjectDetail): string {
  return sha256OfFields([...coreDetailFields(detail), detail.masterContractAvailableName]);
}

type CoreFields = Pick<
  MappedProjectSet,
  | "title"
  | "agency"
  | "department"
  | "budget"
  | "referencePrice"
  | "procurementMethod"
  | "procurementType"
  | "goodsCategory"
>;

const CORE_KEYS: (keyof CoreFields)[] = [
  "title",
  "agency",
  "department",
  "budget",
  "referencePrice",
  "procurementMethod",
  "procurementType",
  "goodsCategory",
];

/** True when the stored Tor and the freshly mapped set agree on every hashed field (null == undefined). */
export function sameCoreFields(stored: Partial<CoreFields>, set: MappedProjectSet): boolean {
  return CORE_KEYS.every((k) => (stored[k] ?? null) === (set[k] ?? null));
}

function optionalString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function optionalNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Pure transform: e-GP search row + detail + announcements → a payload the
 * ingestion orchestrator can upsert onto a `Tor`. No I/O, no AI.
 */
export function mapProject(
  project: EgpSearchProject,
  detail: EgpProjectDetail,
  announcements: EgpAnnouncement[],
  opts: { fileBase: string; listingBase: string; now?: Date }
): MappedProject {
  const ingestErrors: string[] = [];

  const set: MappedProjectSet = {
    title: detail.projectName.trim(),
    agency: optionalString(detail.masterOrgGroupName),
    department: optionalString(detail.masterOrgDepartmentName),
    budget: optionalNumber(detail.projectBudget),
    referencePrice: optionalNumber(detail.projectAverageBudget),
    sourceListingUrl: `${opts.listingBase}/${project.projectId}`,
    procurementMethod: optionalString(detail.masterMethodIdName),
    procurementType: optionalString(detail.masterTypeIdName),
    goodsCategory: optionalString(detail.masterGoodsIdName),
  };

  const torAnn = announcements.find((a) => (a.masterAnnounceTypeName ?? "").startsWith(TOR_KIND_PREFIX));

  let torAnnouncement: TorAnnouncementRef | null = null;
  if (!torAnn) {
    ingestErrors.push(`no TOR announcement on project ${project.projectNumber}`);
  } else if (!torAnn.projectAnnouncementPath) {
    ingestErrors.push(`TOR announcement ${torAnn.id} has no attached file`);
  } else {
    const publishedAt = parseDate(torAnn.projectAnnouncementPublishDate);
    torAnnouncement = {
      announcementId: torAnn.id,
      filename: torAnn.projectAnnouncementPath,
      egpUrl: `${opts.fileBase}/${torAnn.id}/${encodeURIComponent(torAnn.projectAnnouncementPath)}`,
      publishedAt,
    };
    if (publishedAt) set.announcementDate = publishedAt;
  }

  return {
    projectCode: project.projectNumber,
    sourceContentHash: canonicalDetailHash(detail),
    legacySourceContentHash: legacyDetailHash(detail),
    set,
    procurement: buildProcurement(announcements, detail.masterContractAvailableName, opts.now ?? new Date()),
    torAnnouncement,
    ingestErrors,
  };
}

export default mapProject;
