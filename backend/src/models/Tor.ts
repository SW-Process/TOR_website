import { Schema, model, type Types } from "mongoose";

export type Confidence = "high" | "medium" | "low";
export type TorStatus = "open" | "closing_soon" | "closed";
export type SourceTextLayer = "digital" | "scanned" | "unreadable" | "missing";
export type TorPipelineStatus = "pending" | "processing" | "enriched" | "rejected" | "failed";

export interface IClassification {
  isSoftwareRelated: boolean;
  reason: string;
  confidence: number;
  model: string;
  at: Date;
}

export interface ISourceDocument {
  egpUrl: string;
  filename: string;
  storageKey: string | null;
  textLayer: SourceTextLayer;
  pageCount: number | null;
  byteSize: number | null;
  sha256: string | null;
  fetchedAt: Date;
}

export interface IEvaluationCriterion {
  label: string;
  weight?: number;
}

export interface IAiSummary {
  keyPoints: string[];
  qualifications: string[];
  evaluationCriteria: IEvaluationCriterion[];
  confidence?: Confidence;
  model?: string;
  generatedAt?: Date;
}

export type FairnessField =
  | "budget"
  | "deadline"
  | "category"
  | "agency"
  | "title"
  | "qualificationRequirements"
  | "other";

export interface IFairnessFlag {
  field: FairnessField;
  severity: "low" | "medium" | "high";
  message: string;
  detectedAt: Date;
  status: "open" | "acknowledged" | "dismissed";
}

export interface ITor {
  title: string;
  description?: string;
  sourceDocumentUrl?: string;
  referencePrice?: number;
  sourceListingUrl?: string;
  procurementMethod?: string;
  procurementType?: string;
  goodsCategory?: string;
  sourceContentHash?: string;
  sourceDocument?: ISourceDocument | null;
  agency?: string;
  department?: string;
  projectCode?: string;
  budget?: number;
  announcementDate?: Date;
  submissionDeadline?: Date;
  technologyStack: string[];
  projectType?: string;
  qualificationRequirements: string[];
  evaluationCriteria?: string;
  location?: string;
  status: TorStatus;
  viewCount: number;
  aiSummary: IAiSummary | null;
  fairnessFlags: Types.DocumentArray<IFairnessFlag>;
  similarTORs: Types.ObjectId[];
  ingestionRunId?: Types.ObjectId;
  category?: string;
  categoryTags: string[];
  taxonomyVersion?: string;
  classification?: IClassification | null;
  pipelineStatus: TorPipelineStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * aiSummary — embedded (FR-12 / FR-20). Always fetched with the TOR,
 * never queried on its own.
 */
const aiSummarySchema = new Schema<IAiSummary>(
  {
    keyPoints: { type: [String], default: [] },
    qualifications: { type: [String], default: [] },
    evaluationCriteria: {
      type: [
        {
          label: { type: String, required: true },
          weight: { type: Number, min: 0, max: 100 },
          _id: false,
        },
      ],
      default: [],
    },
    confidence: {
      type: String,
      enum: ["high", "medium", "low"],
    },
    model: { type: String }, // which AI model / version produced this
    generatedAt: { type: Date },
  },
  { _id: false }
);

/**
 * fairnessFlags — embedded array (Section 5.2). Reviewed by Admins on the
 * TOR detail page (UC-5); not a queryable entity of its own.
 */
const fairnessFlagSchema = new Schema<IFairnessFlag>(
  {
    field: {
      type: String,
      enum: ["budget", "deadline", "category", "agency", "title", "qualificationRequirements", "other"],
      required: true,
    },
    severity: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    message: { type: String, required: true },
    detectedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ["open", "acknowledged", "dismissed"], default: "open" },
  },
  { _id: true }
);

/**
 * sourceDocument — the stored TOR PDF and what we know about it (FR-05 / FR-11).
 * `storageKey` is null and `textLayer` is "missing" when the file could not be fetched.
 */
const sourceDocumentSchema = new Schema<ISourceDocument>(
  {
    egpUrl: { type: String, required: true },
    filename: { type: String, required: true },
    storageKey: { type: String, default: null },
    textLayer: {
      type: String,
      enum: ["digital", "scanned", "unreadable", "missing"],
      required: true,
    },
    pageCount: { type: Number, default: null },
    byteSize: { type: Number, default: null },
    sha256: { type: String, default: null },
    fetchedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/**
 * classification — AI enrichment classification for the TOR.
 * Records whether the TOR is software-related with confidence and reasoning.
 */
const classificationSchema = new Schema<IClassification>(
  {
    isSoftwareRelated: { type: Boolean, required: true },
    reason: { type: String, required: true },
    confidence: { type: Number, min: 0, max: 1, required: true },
    model: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

/**
 * tors — the central entity.
 */
const torSchema = new Schema<ITor>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String },
    // reference into GCS — the PDF binary is not stored in Mongo
    sourceDocumentUrl: { type: String },
    // ราคากลาง — fairness compares budget against this (Section 5.2)
    referencePrice: { type: Number, min: 0 },
    // link back to the e-GP project page (FR-05)
    sourceListingUrl: { type: String },
    procurementMethod: { type: String },
    procurementType: { type: String },
    goodsCategory: { type: String },
    // sha256 of the canonicalised e-GP detail JSON — drives create vs update vs unchanged
    sourceContentHash: { type: String, index: true },
    sourceDocument: { type: sourceDocumentSchema, default: null },
    agency: { type: String, index: true },
    department: { type: String },
    // stable identifier from the source system (e.g. e-GP project code)
    projectCode: { type: String, unique: true, sparse: true },
    budget: { type: Number, min: 0 },
    announcementDate: { type: Date },
    submissionDeadline: { type: Date, index: true },
    technologyStack: { type: [String], default: [], index: true },
    projectType: { type: String, index: true },
    qualificationRequirements: { type: [String], default: [] },
    evaluationCriteria: { type: String },
    location: { type: String },
    // lifecycle status, derivable from submissionDeadline but denormalized for filtering
    status: {
      type: String,
      enum: ["open", "closing_soon", "closed"],
      default: "open",
      index: true,
    },
    viewCount: { type: Number, default: 0 },
    aiSummary: { type: aiSummarySchema, default: null },
    fairnessFlags: { type: [fairnessFlagSchema], default: [] },
    // FR-11 / FR-18 — precomputed "similar TOR" references
    similarTORs: { type: [{ type: Schema.Types.ObjectId, ref: "Tor" }], default: [] },
    // which ingestion run last created/updated this document
    ingestionRunId: { type: Schema.Types.ObjectId, ref: "IngestionRun" },
    category: { type: String },
    categoryTags: { type: [String], default: [] },
    taxonomyVersion: { type: String },
    classification: { type: classificationSchema, default: null },
    pipelineStatus: {
      type: String,
      enum: ["pending", "processing", "enriched", "rejected", "failed"],
      default: "pending",
    },
  },
  { timestamps: true }
);

// Full-text search over the fields the public search UI queries
torSchema.index({ title: "text", description: "text", agency: "text" });

// Enrichment indexes
torSchema.index({ category: 1, announcementDate: -1 });
torSchema.index({ agency: 1, announcementDate: -1 });
torSchema.index({ pipelineStatus: 1, announcementDate: -1 });

export const Tor = model<ITor>("Tor", torSchema);
export default Tor;
