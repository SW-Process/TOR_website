# TOR Ingestion Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-triggered ingestion run to the TS backend that pulls software-procurement TORs from the Bangkok e-GP API, upserts them into the `tors` collection, and downloads each TOR's source PDF into a swappable blob store.

**Architecture:** One in-process orchestrator (`runIngestion`) started by `POST /api/ingestion/runs`; the endpoint creates an `IngestionRun`, returns its id, and the crawl continues in the background writing progress to that document. Per-project work is a self-contained function so a future queue consumer can call it unchanged. PDF bytes go to a `BlobStorage` adapter (local disk now, GCS later); nothing binary goes in Mongo.

**Tech Stack:** TypeScript, Express 5, Mongoose 9, native `fetch`, `pdf-parse` (text-layer detection), Jest + ts-jest + mongodb-memory-server + supertest, `pdf-lib` (test fixtures only).

**Spec:** `docs/superpowers/specs/2026-08-28-tor-ingestion-backend-design.md`

## Global Constraints

- Language: TypeScript, `strict` + `noUncheckedIndexedAccess` on. Every array index access must be guarded.
- Module system: CommonJS output (`tsconfig` `module: "commonjs"`), `esModuleInterop` on — use default imports.
- Test command: `npm test` (runs `jest --runInBand`). Jest `clearMocks: true`. Test files: `backend/src/**/__tests__/**/*.test.ts`.
- Dev/build: `npm run dev` (`tsx watch src/server.ts`), `npm run typecheck` (`tsc --noEmit`), `npm run build` (`tsc`).
- Error style: controllers `throw httpError(status, message)` from `../utils/httpError`; the central `errorHandler` in `app.ts` formats it. Async controllers rely on Express 5 auto-forwarding rejected promises.
- Auth: `import { requireAuth, requireRole } from "../middleware/auth"`; `req.user` is `{ id: string; role: "vendor" | "admin" }`.
- Models: `import { Tor, IngestionRun, SystemLog } from "../models"`. Model file pattern: `export const X = model<IX>(...)` + `export default X` + `interface IX`.
- e-GP politeness (NFR-07): sequential requests only, honest User-Agent, request delay, retry with backoff, per-request timeout. All configurable via env with the defaults below.
- e-GP constants: `EGP_API_BASE=https://egp2.bangkok.go.th/appapi/api`, `EGP_FILE_BASE=https://egp2.bangkok.go.th/api/file`, `EGP_LISTING_BASE=https://egp2.bangkok.go.th/project-detail`, `TOR_TYPE_ID=24995aa2-d875-4d3d-9dec-d5e22d222aa4`.
- Text-layer threshold: `TEXT_LAYER_MIN_CHARS_PER_PAGE = 200` (verbatim from `munyin.py`).
- Blob key scheme: `tor-pdfs/<projectNumber>/<announcementId>.pdf`.
- Commits: Conventional Commits, imperative, no trailing period, scope `ingestion`. End every commit message body with:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
- Branch: `feat/tor-ingestion` (already created off `main`).

---

## File Structure

**Create**
- `backend/src/scraper/egpClient.types.ts` — interfaces for e-GP JSON responses + `EgpClientLike` + `TOR_TYPE_ID`
- `backend/src/scraper/egpClient.ts` — `EgpClient` class, `egpConfigFromEnv`, `listingUrl`
- `backend/src/storage/storage.types.ts` — `BlobStorage` interface
- `backend/src/storage/localDiskStorage.ts` — `LocalDiskStorage`
- `backend/src/storage/gcsStorage.ts` — `GcsStorage` stub
- `backend/src/storage/index.ts` — `getStorage`, `setStorageForTest`
- `backend/src/ingestion/pdfInspect.ts` — `pdfInspect`, `TEXT_LAYER_MIN_CHARS_PER_PAGE`
- `backend/src/ingestion/log.ts` — `logIngestionEvent`
- `backend/src/ingestion/mapProject.ts` — `mapProject`, `MappedProject`, `canonicalDetailHash`
- `backend/src/ingestion/fetchAndStoreTorPdf.ts` — `fetchAndStoreTorPdf`
- `backend/src/ingestion/runIngestion.ts` — `runIngestion`, `RunIngestionOptions`, `RunIngestionResult`
- `backend/src/controllers/ingestionController.ts` — `createRun`, `listRuns`, `getRun`
- `backend/src/routes/ingestionRoutes.ts`
- `backend/src/controllers/torDocumentController.ts` — `streamTorDocument`
- `backend/src/routes/torRoutes.ts`
- Test files under `backend/src/**/__tests__/` (one per task)

**Modify**
- `backend/src/models/Tor.ts` — new fields + `sourceDocumentSchema` + `ISourceDocument`
- `backend/src/models/index.ts` — re-export `ISourceDocument`, `SourceTextLayer`
- `backend/src/app.ts` — mount `/api/ingestion` and `/api/tors`
- `backend/.gitignore` — add `/storage`
- `backend/.env.example` — ingestion + storage vars
- `backend/package.json` — add `pdf-parse`; dev `@types/pdf-parse`, `pdf-lib`

---

## Task 1: Tor model — ingestion fields

**Files:**
- Modify: `backend/src/models/Tor.ts`
- Modify: `backend/src/models/index.ts`
- Modify: `backend/.gitignore`
- Test: `backend/src/models/__tests__/tor.ingestion.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type SourceTextLayer = "digital" | "scanned" | "unreadable" | "missing"`
  - `interface ISourceDocument { egpUrl: string; filename: string; storageKey: string | null; textLayer: SourceTextLayer; pageCount: number | null; byteSize: number | null; sha256: string | null; fetchedAt: Date }`
  - `ITor` gains optional: `referencePrice?: number; sourceListingUrl?: string; procurementMethod?: string; procurementType?: string; goodsCategory?: string; sourceContentHash?: string; sourceDocument?: ISourceDocument | null`

- [ ] **Step 1: Write the failing test**

Create `backend/src/models/__tests__/tor.ingestion.test.ts`:

```ts
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Tor } from "../index";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Tor.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("Tor ingestion fields", () => {
  it("persists the new scalar fields and an embedded sourceDocument", async () => {
    const tor = await Tor.create({
      title: "จ้างพัฒนาระบบ",
      projectCode: "69000000001",
      budget: 1_000_000,
      referencePrice: 950_000,
      sourceListingUrl: "https://egp2.bangkok.go.th/project-detail/abc",
      procurementMethod: "ประกวดราคา",
      procurementType: "จ้าง",
      goodsCategory: "งานจ้างพัฒนาระบบ",
      sourceContentHash: "a".repeat(64),
      sourceDocument: {
        egpUrl: "https://egp2.bangkok.go.th/api/file/ann-1/tor.pdf",
        filename: "tor.pdf",
        storageKey: "tor-pdfs/69000000001/ann-1.pdf",
        textLayer: "scanned",
        pageCount: 12,
        byteSize: 345678,
        sha256: "b".repeat(64),
        fetchedAt: new Date("2026-08-29T00:00:00Z"),
      },
    });

    const found = await Tor.findById(tor._id).lean();
    expect(found?.referencePrice).toBe(950_000);
    expect(found?.sourceContentHash).toBe("a".repeat(64));
    expect(found?.sourceDocument?.textLayer).toBe("scanned");
    expect(found?.sourceDocument?.pageCount).toBe(12);
  });

  it("rejects an invalid textLayer enum", async () => {
    await expect(
      Tor.create({
        title: "x",
        sourceDocument: {
          egpUrl: "u",
          filename: "f.pdf",
          storageKey: null,
          // @ts-expect-error invalid enum on purpose
          textLayer: "bogus",
          pageCount: null,
          byteSize: null,
          sha256: null,
          fetchedAt: new Date(),
        },
      })
    ).rejects.toThrow(/validation/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/models/__tests__/tor.ingestion.test.ts`
Expected: FAIL — `referencePrice`/`sourceDocument` are stripped (not in schema), first assertion gets `undefined`.

- [ ] **Step 3: Add the schema + types**

In `backend/src/models/Tor.ts`, add above `torSchema`:

```ts
export type SourceTextLayer = "digital" | "scanned" | "unreadable" | "missing";

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
```

In the `ITor` interface add, next to `sourceDocumentUrl`:

```ts
  referencePrice?: number;
  sourceListingUrl?: string;
  procurementMethod?: string;
  procurementType?: string;
  goodsCategory?: string;
  sourceContentHash?: string;
  sourceDocument?: ISourceDocument | null;
```

In `torSchema` add, right after the `sourceDocumentUrl` field:

```ts
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
```

- [ ] **Step 4: Re-export the new types**

In `backend/src/models/index.ts`, change the `Tor` type re-export line to:

```ts
export type { ITor, IAiSummary, IFairnessFlag, ISourceDocument, SourceTextLayer } from "./Tor";
```

- [ ] **Step 5: Ignore the local storage dir**

Append to `backend/.gitignore`:

```
storage/
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx jest src/models/__tests__/tor.ingestion.test.ts`
Expected: PASS (both tests).

- [ ] **Step 7: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add backend/src/models/Tor.ts backend/src/models/index.ts backend/.gitignore backend/src/models/__tests__/tor.ingestion.test.ts
git commit -m "feat(ingestion): add source-document fields to the Tor model

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Blob storage — interface + local disk driver

**Files:**
- Create: `backend/src/storage/storage.types.ts`
- Create: `backend/src/storage/localDiskStorage.ts`
- Modify: `backend/.env.example`
- Test: `backend/src/storage/__tests__/localDiskStorage.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface BlobPutResult { key: string; size: number }`
  - `interface BlobStorage { put(key: string, body: Buffer, opts: { contentType: string }): Promise<BlobPutResult>; getStream(key: string): Promise<NodeJS.ReadableStream>; exists(key: string): Promise<boolean>; publicUrl(key: string): string | null }`
  - `class LocalDiskStorage implements BlobStorage { constructor(rootDir: string) }`

- [ ] **Step 1: Write the failing test**

Create `backend/src/storage/__tests__/localDiskStorage.test.ts`:

```ts
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDiskStorage } from "../localDiskStorage";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "blobstore-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const KEY = "tor-pdfs/69000000001/ann-1.pdf";

describe("LocalDiskStorage", () => {
  it("put writes the file under the root and reports its size", async () => {
    const storage = new LocalDiskStorage(root);
    const body = Buffer.from("%PDF-1.4 fake");

    const result = await storage.put(KEY, body, { contentType: "application/pdf" });

    expect(result).toEqual({ key: KEY, size: body.length });
    expect(await readFile(join(root, KEY))).toEqual(body);
  });

  it("exists reflects whether the key was written", async () => {
    const storage = new LocalDiskStorage(root);
    expect(await storage.exists(KEY)).toBe(false);
    await storage.put(KEY, Buffer.from("x"), { contentType: "application/pdf" });
    expect(await storage.exists(KEY)).toBe(true);
  });

  it("getStream yields the stored bytes", async () => {
    const storage = new LocalDiskStorage(root);
    const body = Buffer.from("hello tor");
    await storage.put(KEY, body, { contentType: "application/pdf" });

    const stream = await storage.getStream(KEY);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks)).toEqual(body);
  });

  it("getStream rejects for a missing key", async () => {
    const storage = new LocalDiskStorage(root);
    await expect(storage.getStream("nope/missing.pdf")).rejects.toThrow();
  });

  it("publicUrl is null for local disk", () => {
    expect(new LocalDiskStorage(root).publicUrl(KEY)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/storage/__tests__/localDiskStorage.test.ts`
Expected: FAIL — `Cannot find module '../localDiskStorage'`.

- [ ] **Step 3: Write the interface**

Create `backend/src/storage/storage.types.ts`:

```ts
export interface BlobPutResult {
  key: string;
  size: number;
}

/**
 * Minimal blob store the ingestion pipeline needs. Implemented by
 * LocalDiskStorage now; GcsStorage later. Callers never learn which.
 */
export interface BlobStorage {
  put(key: string, body: Buffer, opts: { contentType: string }): Promise<BlobPutResult>;
  getStream(key: string): Promise<NodeJS.ReadableStream>;
  exists(key: string): Promise<boolean>;
  /** Absolute URL when the driver serves files directly (GCS), else null. */
  publicUrl(key: string): string | null;
}
```

- [ ] **Step 4: Write LocalDiskStorage**

Create `backend/src/storage/localDiskStorage.ts`:

```ts
import { createReadStream } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { BlobPutResult, BlobStorage } from "./storage.types";

/** Stores blobs as plain files under `rootDir`, mirroring the key path. */
export class LocalDiskStorage implements BlobStorage {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = resolve(rootDir);
  }

  private pathFor(key: string): string {
    const full = resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new Error(`blob key escapes storage root: ${key}`);
    }
    return full;
  }

  async put(key: string, body: Buffer, _opts: { contentType: string }): Promise<BlobPutResult> {
    const target = this.pathFor(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
    return { key, size: body.length };
  }

  async getStream(key: string): Promise<NodeJS.ReadableStream> {
    const target = this.pathFor(key);
    await access(target); // throws if missing, so callers get a rejected promise
    return createReadStream(target);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }

  publicUrl(_key: string): string | null {
    return null;
  }
}

export default LocalDiskStorage;
```

Note: `join` is imported but unused — remove it; keep only `dirname, resolve, sep`. (`noUnusedLocals` is not set, but keep it clean.)

- [ ] **Step 5: Add storage env vars**

In `backend/.env.example`, append:

```
# Blob storage
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=./storage
# GCS_BUCKET=
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx jest src/storage/__tests__/localDiskStorage.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/src/storage/storage.types.ts backend/src/storage/localDiskStorage.ts backend/src/storage/__tests__/localDiskStorage.test.ts backend/.env.example
git commit -m "feat(ingestion): add blob storage interface and local disk driver

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Blob storage — GCS stub + getStorage selector

**Files:**
- Create: `backend/src/storage/gcsStorage.ts`
- Create: `backend/src/storage/index.ts`
- Test: `backend/src/storage/__tests__/getStorage.test.ts`

**Interfaces:**
- Consumes: `BlobStorage` (Task 2), `LocalDiskStorage` (Task 2)
- Produces:
  - `class GcsStorage implements BlobStorage { constructor(bucket: string) }` — every method rejects/throws `"gcs storage not implemented"`
  - `function getStorage(): BlobStorage` — memoised, selects on `process.env.STORAGE_DRIVER ?? "local"`, local dir from `process.env.STORAGE_LOCAL_DIR ?? "./storage"`
  - `function setStorageForTest(s: BlobStorage | null): void` — overrides/clears the memo

- [ ] **Step 1: Write the failing test**

Create `backend/src/storage/__tests__/getStorage.test.ts`:

```ts
import { LocalDiskStorage } from "../localDiskStorage";
import { GcsStorage } from "../gcsStorage";
import { getStorage, setStorageForTest } from "../index";

afterEach(() => {
  setStorageForTest(null);
  delete process.env.STORAGE_DRIVER;
});

describe("getStorage", () => {
  it("defaults to LocalDiskStorage", () => {
    expect(getStorage()).toBeInstanceOf(LocalDiskStorage);
  });

  it("returns GcsStorage when STORAGE_DRIVER=gcs", () => {
    process.env.STORAGE_DRIVER = "gcs";
    process.env.GCS_BUCKET = "test-bucket";
    expect(getStorage()).toBeInstanceOf(GcsStorage);
  });

  it("memoises the instance", () => {
    expect(getStorage()).toBe(getStorage());
  });

  it("setStorageForTest overrides the instance", () => {
    const fake = {} as never;
    setStorageForTest(fake);
    expect(getStorage()).toBe(fake);
  });

  it("throws for an unknown driver", () => {
    process.env.STORAGE_DRIVER = "s3";
    expect(() => getStorage()).toThrow(/unknown storage driver/i);
  });
});

describe("GcsStorage stub", () => {
  it("rejects put until implemented", async () => {
    await expect(
      new GcsStorage("b").put("k", Buffer.from("x"), { contentType: "application/pdf" })
    ).rejects.toThrow(/not implemented/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/storage/__tests__/getStorage.test.ts`
Expected: FAIL — modules `../gcsStorage` / `../index` not found.

- [ ] **Step 3: Write the GCS stub**

Create `backend/src/storage/gcsStorage.ts`:

```ts
import type { BlobPutResult, BlobStorage } from "./storage.types";

const NOT_IMPLEMENTED = "gcs storage not implemented";

/**
 * Placeholder so `STORAGE_DRIVER=gcs` is a one-line switch later.
 * Real implementation (`@google-cloud/storage`, signed URLs) lands in the GCS phase.
 */
export class GcsStorage implements BlobStorage {
  constructor(private readonly bucket: string) {}

  put(_key: string, _body: Buffer, _opts: { contentType: string }): Promise<BlobPutResult> {
    return Promise.reject(new Error(NOT_IMPLEMENTED));
  }

  getStream(_key: string): Promise<NodeJS.ReadableStream> {
    return Promise.reject(new Error(NOT_IMPLEMENTED));
  }

  exists(_key: string): Promise<boolean> {
    return Promise.reject(new Error(NOT_IMPLEMENTED));
  }

  publicUrl(key: string): string | null {
    return `https://storage.googleapis.com/${this.bucket}/${key}`;
  }
}

export default GcsStorage;
```

- [ ] **Step 4: Write the selector**

Create `backend/src/storage/index.ts`:

```ts
import { LocalDiskStorage } from "./localDiskStorage";
import { GcsStorage } from "./gcsStorage";
import type { BlobStorage } from "./storage.types";

export type { BlobStorage, BlobPutResult } from "./storage.types";

let instance: BlobStorage | null = null;

function build(): BlobStorage {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "local") {
    return new LocalDiskStorage(process.env.STORAGE_LOCAL_DIR ?? "./storage");
  }
  if (driver === "gcs") {
    return new GcsStorage(process.env.GCS_BUCKET ?? "");
  }
  throw new Error(`unknown storage driver: ${driver}`);
}

/** Process-wide blob store, chosen by STORAGE_DRIVER. */
export function getStorage(): BlobStorage {
  if (!instance) instance = build();
  return instance;
}

/** Test hook: pass a fake to override, or null to force a rebuild next call. */
export function setStorageForTest(s: BlobStorage | null): void {
  instance = s;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest src/storage/__tests__/getStorage.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/storage/gcsStorage.ts backend/src/storage/index.ts backend/src/storage/__tests__/getStorage.test.ts
git commit -m "feat(ingestion): add gcs storage stub and driver selector

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: PDF text-layer inspection

**Files:**
- Create: `backend/src/ingestion/pdfInspect.ts`
- Modify: `backend/package.json` (add `pdf-parse`; dev `@types/pdf-parse`, `pdf-lib`)
- Test: `backend/src/ingestion/__tests__/pdfInspect.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type TextLayer = "digital" | "scanned" | "unreadable"`
  - `interface PdfInspectResult { pageCount: number | null; textLayer: TextLayer }`
  - `type PdfParseFn = (buf: Buffer) => Promise<{ numpages: number; text: string }>`
  - `const TEXT_LAYER_MIN_CHARS_PER_PAGE = 200`
  - `function pdfInspect(buf: Buffer, parse?: PdfParseFn): Promise<PdfInspectResult>`

- [ ] **Step 1: Install dependencies**

Run:
```bash
cd backend && npm install pdf-parse@^1.1.1 && npm install -D @types/pdf-parse@^1.1.5 pdf-lib@^1.17.1
```
Expected: `package.json` + `package-lock.json` updated.

- [ ] **Step 2: Write the failing test**

Create `backend/src/ingestion/__tests__/pdfInspect.test.ts`:

```ts
import { PDFDocument, StandardFonts } from "pdf-lib";
import { pdfInspect, TEXT_LAYER_MIN_CHARS_PER_PAGE } from "../pdfInspect";

async function textPdf(text: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([320, 480]);
  page.drawText(text, { x: 20, y: 440, size: 9, font, lineHeight: 11, maxWidth: 280 });
  return Buffer.from(await doc.save());
}

async function blankPdf(pages = 1): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) doc.addPage([320, 480]);
  return Buffer.from(await doc.save());
}

describe("pdfInspect (injected parser — threshold logic)", () => {
  const many = (n: number): string => "a".repeat(n);

  it("classifies >= threshold chars/page as digital", async () => {
    const result = await pdfInspect(Buffer.from("x"), async () => ({
      numpages: 2,
      text: many(TEXT_LAYER_MIN_CHARS_PER_PAGE * 2),
    }));
    expect(result).toEqual({ pageCount: 2, textLayer: "digital" });
  });

  it("classifies < threshold chars/page as scanned", async () => {
    const result = await pdfInspect(Buffer.from("x"), async () => ({
      numpages: 4,
      text: many(50),
    }));
    expect(result).toEqual({ pageCount: 4, textLayer: "scanned" });
  });

  it("returns unreadable when the parser throws", async () => {
    const result = await pdfInspect(Buffer.from("x"), async () => {
      throw new Error("bad xref");
    });
    expect(result).toEqual({ pageCount: null, textLayer: "unreadable" });
  });

  it("treats zero pages as scanned, not a divide-by-zero", async () => {
    const result = await pdfInspect(Buffer.from("x"), async () => ({ numpages: 0, text: "" }));
    expect(result).toEqual({ pageCount: null, textLayer: "scanned" });
  });
});

describe("pdfInspect (real pdf-parse)", () => {
  it("detects a text layer in a generated text PDF", async () => {
    const buf = await textPdf(
      "This is a Terms of Reference document with a real text layer. ".repeat(6)
    );
    const result = await pdfInspect(buf);
    expect(result.textLayer).toBe("digital");
    expect(result.pageCount).toBe(1);
  });

  it("classifies a blank PDF as scanned", async () => {
    const result = await pdfInspect(await blankPdf(2));
    expect(result.textLayer).toBe("scanned");
    expect(result.pageCount).toBe(2);
  });

  it("classifies a non-PDF buffer as unreadable", async () => {
    const result = await pdfInspect(Buffer.from("definitely not a pdf"));
    expect(result).toEqual({ pageCount: null, textLayer: "unreadable" });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx jest src/ingestion/__tests__/pdfInspect.test.ts`
Expected: FAIL — `Cannot find module '../pdfInspect'`.

- [ ] **Step 4: Write pdfInspect**

Create `backend/src/ingestion/pdfInspect.ts`:

```ts
import pdfParse from "pdf-parse";

export type TextLayer = "digital" | "scanned" | "unreadable";

export interface PdfInspectResult {
  pageCount: number | null;
  textLayer: TextLayer;
}

export type PdfParseFn = (buf: Buffer) => Promise<{ numpages: number; text: string }>;

/** A page averaging fewer than this many characters needs OCR. Verbatim from munyin.py. */
export const TEXT_LAYER_MIN_CHARS_PER_PAGE = 200;

const defaultParse: PdfParseFn = async (buf) => {
  const data = await pdfParse(buf);
  return { numpages: data.numpages, text: data.text };
};

/**
 * Report page count and whether a PDF carries a usable text layer.
 * `digital` = extractable text, `scanned` = needs OCR, `unreadable` = not a parseable PDF.
 */
export async function pdfInspect(buf: Buffer, parse: PdfParseFn = defaultParse): Promise<PdfInspectResult> {
  try {
    const { numpages, text } = await parse(buf);
    if (!numpages || numpages < 1) {
      return { pageCount: null, textLayer: "scanned" };
    }
    const perPage = text.length / numpages;
    return {
      pageCount: numpages,
      textLayer: perPage >= TEXT_LAYER_MIN_CHARS_PER_PAGE ? "digital" : "scanned",
    };
  } catch {
    return { pageCount: null, textLayer: "unreadable" };
  }
}

export default pdfInspect;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest src/ingestion/__tests__/pdfInspect.test.ts`
Expected: PASS (7 tests). If the real-`pdf-parse` block errors with a test-file read (`./test/data/05-versions-space.pdf`), change the import to `import pdfParse from "pdf-parse/lib/pdf-parse.js";` and add `backend/src/types/pdf-parse-lib.d.ts` with `declare module "pdf-parse/lib/pdf-parse.js" { import pdf from "pdf-parse"; export default pdf; }`, then re-run.

- [ ] **Step 6: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/ingestion/pdfInspect.ts backend/src/ingestion/__tests__/pdfInspect.test.ts backend/package.json backend/package-lock.json backend/src/types/pdf-parse-lib.d.ts
git commit -m "feat(ingestion): add pdf text-layer inspection

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
(Drop the `.d.ts` path from `git add` if Step 5 did not need it.)

---

## Task 5: e-GP API client

**Files:**
- Create: `backend/src/scraper/egpClient.types.ts`
- Create: `backend/src/scraper/egpClient.ts`
- Modify: `backend/.env.example`
- Test: `backend/src/scraper/__tests__/egpClient.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `egpClient.types.ts`:
    - `interface EgpSearchProject { projectId: string; projectNumber: string }`
    - `interface EgpSearchResponse { totalCount: number; hasNextPage: boolean; data: EgpSearchProject[] }`
    - `interface EgpProjectDetail { projectName: string; masterOrgGroupName: string | null; masterOrgDepartmentName: string | null; projectBudget: number | null; projectAverageBudget: number | null; masterMethodIdName: string | null; masterTypeIdName: string | null; masterGoodsIdName: string | null; masterContractAvailableName: string | null }`
    - `interface EgpAnnouncement { id: string; masterAnnounceTypeName: string | null; projectAnnouncementPublishDate: string | null; projectAnnouncementPath: string | null }`
    - `interface EgpSearchParams { page: number; pageSize?: number; announceTypeId?: string | null; searchText?: string; fromDate?: string; toDate?: string }`
    - `interface EgpClientLike { searchProjects(p: EgpSearchParams): Promise<EgpSearchResponse>; projectDetail(projectId: string): Promise<EgpProjectDetail>; announcements(projectId: string): Promise<EgpAnnouncement[]>; downloadFile(announcementId: string, filename: string): Promise<Buffer> }`
    - `const TOR_TYPE_ID = "24995aa2-d875-4d3d-9dec-d5e22d222aa4"`
  - `egpClient.ts`:
    - `interface EgpClientConfig { apiBase: string; fileBase: string; userAgent: string; delayMs: number; maxRetries: number; timeoutMs: number; sleep?: (ms: number) => Promise<void> }`
    - `function egpConfigFromEnv(env?: NodeJS.ProcessEnv): EgpClientConfig`
    - `function listingUrl(projectId: string, env?: NodeJS.ProcessEnv): string`
    - `class EgpClient implements EgpClientLike { constructor(config: EgpClientConfig) }`

- [ ] **Step 1: Write the failing test**

Create `backend/src/scraper/__tests__/egpClient.test.ts`:

```ts
import { EgpClient, egpConfigFromEnv, listingUrl } from "../egpClient";
import { TOR_TYPE_ID } from "../egpClient.types";

const CONFIG = {
  apiBase: "https://egp.test/appapi/api",
  fileBase: "https://egp.test/api/file",
  userAgent: "Test/1.0",
  delayMs: 0,
  maxRetries: 3,
  timeoutMs: 1000,
  sleep: () => Promise.resolve(),
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("EgpClient.searchProjects", () => {
  it("builds the filter query and returns the parsed page", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse({ totalCount: 1, hasNextPage: false, data: [{ projectId: "p1", projectNumber: "69000000001" }] }));

    const client = new EgpClient(CONFIG);
    const page = await client.searchProjects({ page: 2, pageSize: 25, announceTypeId: TOR_TYPE_ID, searchText: "ซอฟต์แวร์" });

    expect(page.data[0]?.projectNumber).toBe("69000000001");
    const url = new URL(fetchMock.mock.calls[0]?.[0] as string);
    expect(url.pathname).toBe("/appapi/api/Projects/GetProjectFromFilter");
    expect(url.searchParams.get("pageNo")).toBe("2");
    expect(url.searchParams.get("pageSize")).toBe("25");
    expect(url.searchParams.get("masterAnnounceTypeId")).toBe(TOR_TYPE_ID);
    expect(url.searchParams.get("projectSearchText")).toBe("ซอฟต์แวร์");
    expect(url.searchParams.get("sortBy")).toBe("publishDateDesc");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe("Test/1.0");
  });

  it("retries on a 500 then succeeds", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(jsonResponse({ message: "boom" }, 500))
      .mockResolvedValueOnce(jsonResponse({ totalCount: 0, hasNextPage: false, data: [] }));

    const client = new EgpClient(CONFIG);
    const page = await client.searchProjects({ page: 1 });

    expect(page.data).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(jsonResponse({ message: "boom" }, 503));
    const client = new EgpClient(CONFIG);
    await expect(client.searchProjects({ page: 1 })).rejects.toThrow(/503/);
  });
});

describe("EgpClient.downloadFile", () => {
  it("encodes the filename and returns a Buffer", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(Buffer.from("%PDF-1.4 bytes"), { status: 200 }));

    const client = new EgpClient(CONFIG);
    const buf = await client.downloadFile("ann-1", "ร่าง TOR.pdf");

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString()).toContain("%PDF");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://egp.test/api/file/ann-1/%E0%B8%A3%E0%B9%88%E0%B8%B2%E0%B8%87%20TOR.pdf");
  });
});

describe("egpConfigFromEnv / listingUrl", () => {
  it("reads bases and politeness knobs from env with defaults", () => {
    const cfg = egpConfigFromEnv({
      EGP_API_BASE: "https://x/api",
      EGP_USER_AGENT: "UA/9",
    } as NodeJS.ProcessEnv);
    expect(cfg.apiBase).toBe("https://x/api");
    expect(cfg.userAgent).toBe("UA/9");
    expect(cfg.delayMs).toBe(400);
    expect(cfg.maxRetries).toBe(4);
  });

  it("builds a project listing URL", () => {
    expect(listingUrl("p1", { EGP_LISTING_BASE: "https://egp.test/project-detail" } as NodeJS.ProcessEnv)).toBe(
      "https://egp.test/project-detail/p1"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/scraper/__tests__/egpClient.test.ts`
Expected: FAIL — `Cannot find module '../egpClient'`.

- [ ] **Step 3: Write the response types**

Create `backend/src/scraper/egpClient.types.ts`:

```ts
/** masterAnnounceTypeId for ร่างขอบเขตของงาน (TOR). */
export const TOR_TYPE_ID = "24995aa2-d875-4d3d-9dec-d5e22d222aa4";

export interface EgpSearchProject {
  projectId: string;
  projectNumber: string;
}

export interface EgpSearchResponse {
  totalCount: number;
  hasNextPage: boolean;
  data: EgpSearchProject[];
}

export interface EgpProjectDetail {
  projectName: string;
  masterOrgGroupName: string | null;
  masterOrgDepartmentName: string | null;
  projectBudget: number | null;
  projectAverageBudget: number | null;
  masterMethodIdName: string | null;
  masterTypeIdName: string | null;
  masterGoodsIdName: string | null;
  masterContractAvailableName: string | null;
}

export interface EgpAnnouncement {
  id: string;
  masterAnnounceTypeName: string | null;
  projectAnnouncementPublishDate: string | null;
  projectAnnouncementPath: string | null;
}

export interface EgpSearchParams {
  page: number;
  pageSize?: number;
  announceTypeId?: string | null;
  searchText?: string;
  fromDate?: string;
  toDate?: string;
}

export interface EgpClientLike {
  searchProjects(params: EgpSearchParams): Promise<EgpSearchResponse>;
  projectDetail(projectId: string): Promise<EgpProjectDetail>;
  announcements(projectId: string): Promise<EgpAnnouncement[]>;
  downloadFile(announcementId: string, filename: string): Promise<Buffer>;
}
```

- [ ] **Step 4: Write the client**

Create `backend/src/scraper/egpClient.ts`:

```ts
import type {
  EgpAnnouncement,
  EgpClientLike,
  EgpProjectDetail,
  EgpSearchParams,
  EgpSearchResponse,
} from "./egpClient.types";

export interface EgpClientConfig {
  apiBase: string;
  fileBase: string;
  userAgent: string;
  delayMs: number;
  maxRetries: number;
  timeoutMs: number;
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function numFromEnv(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function egpConfigFromEnv(env: NodeJS.ProcessEnv = process.env): EgpClientConfig {
  return {
    apiBase: env.EGP_API_BASE ?? "https://egp2.bangkok.go.th/appapi/api",
    fileBase: env.EGP_FILE_BASE ?? "https://egp2.bangkok.go.th/api/file",
    userAgent: env.EGP_USER_AGENT ?? "BkkTorAggregator/0.1 (Kasetsart University project)",
    delayMs: numFromEnv(env.EGP_REQUEST_DELAY_MS, 400),
    maxRetries: numFromEnv(env.EGP_MAX_RETRIES, 4),
    timeoutMs: numFromEnv(env.EGP_TIMEOUT_MS, 120_000),
  };
}

export function listingUrl(projectId: string, env: NodeJS.ProcessEnv = process.env): string {
  const base = env.EGP_LISTING_BASE ?? "https://egp2.bangkok.go.th/project-detail";
  return `${base}/${projectId}`;
}

/** Polite read-only client over the Bangkok e-GP public API (see munyin.py). */
export class EgpClient implements EgpClientLike {
  private readonly cfg: EgpClientConfig;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(config: EgpClientConfig) {
    this.cfg = config;
    this.sleep = config.sleep ?? wait;
  }

  private async request(url: string, accept: "json" | "bytes"): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt < this.cfg.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
      try {
        const res = await fetch(url, {
          method: "GET",
          signal: controller.signal,
          headers: {
            "User-Agent": this.cfg.userAgent,
            Accept: accept === "json" ? "application/json" : "application/pdf,application/octet-stream",
          },
        });
        if (!res.ok) throw new Error(`e-GP ${res.status} for ${url}`);
        await this.sleep(this.cfg.delayMs); // politeness: pause after every successful call
        return res;
      } catch (err) {
        lastError = err;
        clearTimeout(timer);
        if (attempt === this.cfg.maxRetries - 1) break;
        await this.sleep(2 ** attempt * 1000);
        continue;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async getJson<T>(path: string, query: Record<string, string>): Promise<T> {
    const url = new URL(`${this.cfg.apiBase}${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const res = await this.request(url.toString(), "json");
    return (await res.json()) as T;
  }

  searchProjects(params: EgpSearchParams): Promise<EgpSearchResponse> {
    return this.getJson<EgpSearchResponse>("/Projects/GetProjectFromFilter", {
      projectSearchText: params.searchText ?? "",
      masterAnnounceTypeId: params.announceTypeId ?? "",
      startDate: params.fromDate ?? "",
      endDate: params.toDate ?? "",
      pageNo: String(params.page),
      pageSize: String(params.pageSize ?? 50),
      sortBy: "publishDateDesc",
    });
  }

  projectDetail(projectId: string): Promise<EgpProjectDetail> {
    return this.getJson<EgpProjectDetail>("/Projects/GetProjectDetail", { projectId });
  }

  async announcements(projectId: string): Promise<EgpAnnouncement[]> {
    const data = await this.getJson<{ data?: EgpAnnouncement[] }>(
      "/ProjectAnnouncements/GetAnnouncementDetailInProject",
      { pageNo: "1", pageSize: "50", projectId }
    );
    return data.data ?? [];
  }

  async downloadFile(announcementId: string, filename: string): Promise<Buffer> {
    const url = `${this.cfg.fileBase}/${announcementId}/${encodeURIComponent(filename)}`;
    const res = await this.request(url, "bytes");
    return Buffer.from(await res.arrayBuffer());
  }
}

export default EgpClient;
```

- [ ] **Step 5: Add e-GP env vars**

In `backend/.env.example`, append:

```
# e-GP ingestion scraper
EGP_API_BASE=https://egp2.bangkok.go.th/appapi/api
EGP_FILE_BASE=https://egp2.bangkok.go.th/api/file
EGP_LISTING_BASE=https://egp2.bangkok.go.th/project-detail
EGP_USER_AGENT=BkkTorAggregator/0.1 (Kasetsart University project; <contact-email>)
EGP_REQUEST_DELAY_MS=400
EGP_MAX_RETRIES=4
EGP_TIMEOUT_MS=120000
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx jest src/scraper/__tests__/egpClient.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add backend/src/scraper backend/.env.example
git commit -m "feat(ingestion): add polite e-GP api client

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Ingestion event log helper

**Files:**
- Create: `backend/src/ingestion/log.ts`
- Test: `backend/src/ingestion/__tests__/log.test.ts`

**Interfaces:**
- Consumes: `SystemLog` from `../models`
- Produces:
  - `type IngestSeverity = "info" | "warning" | "error"`
  - `interface LogIngestionEventInput { severity: IngestSeverity; message: string; component?: string; context?: unknown; ingestionRunId?: import("mongoose").Types.ObjectId | null }`
  - `function logIngestionEvent(input: LogIngestionEventInput): Promise<void>` — writes a `SystemLog` with `source: "ingestion"`; swallows its own errors

- [ ] **Step 1: Write the failing test**

Create `backend/src/ingestion/__tests__/log.test.ts`:

```ts
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { SystemLog } from "../../models";
import { logIngestionEvent } from "../log";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await SystemLog.deleteMany({});
  jest.restoreAllMocks();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("logIngestionEvent", () => {
  it("writes a SystemLog row tagged source=ingestion", async () => {
    const runId = new mongoose.Types.ObjectId();
    await logIngestionEvent({
      severity: "warning",
      message: "no TOR document on project 69000000001",
      component: "runIngestion",
      context: { projectNumber: "69000000001" },
      ingestionRunId: runId,
    });

    const rows = await SystemLog.find({}).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBe("ingestion");
    expect(rows[0]?.severity).toBe("warning");
    expect(rows[0]?.ingestionRunId?.toString()).toBe(runId.toString());
  });

  it("never throws when the write fails", async () => {
    jest.spyOn(SystemLog, "create").mockRejectedValue(new Error("db down") as never);
    await expect(
      logIngestionEvent({ severity: "error", message: "x" })
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/ingestion/__tests__/log.test.ts`
Expected: FAIL — `Cannot find module '../log'`.

- [ ] **Step 3: Write the helper**

Create `backend/src/ingestion/log.ts`:

```ts
import type { Types } from "mongoose";
import { SystemLog } from "../models";

export type IngestSeverity = "info" | "warning" | "error";

export interface LogIngestionEventInput {
  severity: IngestSeverity;
  message: string;
  component?: string;
  context?: unknown;
  ingestionRunId?: Types.ObjectId | null;
}

/**
 * Append one ingestion diagnostic row (FR-37/38). A logging failure must never
 * abort a run, so this swallows its own errors after printing them.
 */
export async function logIngestionEvent(input: LogIngestionEventInput): Promise<void> {
  try {
    await SystemLog.create({
      source: "ingestion",
      component: input.component,
      severity: input.severity,
      message: input.message,
      context: input.context,
      ingestionRunId: input.ingestionRunId ?? null,
    });
  } catch (err) {
    console.error("logIngestionEvent failed:", err);
  }
}

export default logIngestionEvent;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/ingestion/__tests__/log.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/ingestion/log.ts backend/src/ingestion/__tests__/log.test.ts
git commit -m "feat(ingestion): add system-log helper for ingestion events

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Map an e-GP project to a Tor upsert payload

**Files:**
- Create: `backend/src/ingestion/mapProject.ts`
- Test: `backend/src/ingestion/__tests__/mapProject.test.ts`

**Interfaces:**
- Consumes: `EgpSearchProject`, `EgpProjectDetail`, `EgpAnnouncement` (Task 5)
- Produces:
  - `interface TorAnnouncementRef { announcementId: string; filename: string; egpUrl: string; publishedAt: Date | null }`
  - `interface MappedProjectSet { title: string; agency?: string; department?: string; budget?: number; referencePrice?: number; announcementDate?: Date; sourceListingUrl: string; procurementMethod?: string; procurementType?: string; goodsCategory?: string }`
  - `interface MappedProject { projectCode: string; sourceContentHash: string; set: MappedProjectSet; torAnnouncement: TorAnnouncementRef | null; ingestErrors: string[] }`
  - `function canonicalDetailHash(detail: EgpProjectDetail): string` — sha256 hex, stable key order
  - `function mapProject(project: EgpSearchProject, detail: EgpProjectDetail, announcements: EgpAnnouncement[], opts: { fileBase: string; listingBase: string }): MappedProject`

- [ ] **Step 1: Write the failing test**

Create `backend/src/ingestion/__tests__/mapProject.test.ts`:

```ts
import type { EgpAnnouncement, EgpProjectDetail, EgpSearchProject } from "../../scraper/egpClient.types";
import { canonicalDetailHash, mapProject } from "../mapProject";

const OPTS = { fileBase: "https://egp.test/api/file", listingBase: "https://egp.test/project-detail" };

const project: EgpSearchProject = { projectId: "p-1", projectNumber: "69000000001" };

const detail: EgpProjectDetail = {
  projectName: "  จ้างพัฒนาระบบสารสนเทศ  ",
  masterOrgGroupName: "สำนักการแพทย์",
  masterOrgDepartmentName: "โรงพยาบาลกลาง",
  projectBudget: 3_920_550,
  projectAverageBudget: 3_900_000,
  masterMethodIdName: "ประกวดราคา",
  masterTypeIdName: "จ้าง",
  masterGoodsIdName: "งานจ้างพัฒนาระบบ",
  masterContractAvailableName: "ระหว่างดำเนินการ",
};

const torAnn: EgpAnnouncement = {
  id: "ann-tor",
  masterAnnounceTypeName: "ร่างขอบเขตของงาน (TOR)",
  projectAnnouncementPublishDate: "2026-08-23T17:00:00Z",
  projectAnnouncementPath: "TOR ปี69.pdf",
};

const priceAnn: EgpAnnouncement = {
  id: "ann-price",
  masterAnnounceTypeName: "ประกาศราคากลาง",
  projectAnnouncementPublishDate: "2026-08-24T17:00:00Z",
  projectAnnouncementPath: "price.pdf",
};

describe("mapProject", () => {
  it("maps detail fields, trims the title, and builds the listing URL", () => {
    const m = mapProject(project, detail, [priceAnn, torAnn], OPTS);
    expect(m.projectCode).toBe("69000000001");
    expect(m.set.title).toBe("จ้างพัฒนาระบบสารสนเทศ");
    expect(m.set.agency).toBe("สำนักการแพทย์");
    expect(m.set.department).toBe("โรงพยาบาลกลาง");
    expect(m.set.budget).toBe(3_920_550);
    expect(m.set.referencePrice).toBe(3_900_000);
    expect(m.set.procurementMethod).toBe("ประกวดราคา");
    expect(m.set.procurementType).toBe("จ้าง");
    expect(m.set.goodsCategory).toBe("งานจ้างพัฒนาระบบ");
    expect(m.set.sourceListingUrl).toBe("https://egp.test/project-detail/p-1");
    expect(m.ingestErrors).toEqual([]);
  });

  it("selects the TOR announcement, encodes its URL, and sets announcementDate from it", () => {
    const m = mapProject(project, detail, [priceAnn, torAnn], OPTS);
    expect(m.torAnnouncement).toEqual({
      announcementId: "ann-tor",
      filename: "TOR ปี69.pdf",
      egpUrl: "https://egp.test/api/file/ann-tor/TOR%20%E0%B8%9B%E0%B8%B569.pdf",
      publishedAt: new Date("2026-08-23T17:00:00Z"),
    });
    expect(m.set.announcementDate).toEqual(new Date("2026-08-23T17:00:00Z"));
  });

  it("records an ingest error and null torAnnouncement when no TOR announcement exists", () => {
    const m = mapProject(project, detail, [priceAnn], OPTS);
    expect(m.torAnnouncement).toBeNull();
    expect(m.ingestErrors).toEqual(["no TOR announcement on project 69000000001"]);
    expect(m.set.announcementDate).toBeUndefined();
  });

  it("records an ingest error when the TOR announcement has no file path", () => {
    const m = mapProject(project, detail, [{ ...torAnn, projectAnnouncementPath: null }], OPTS);
    expect(m.torAnnouncement).toBeNull();
    expect(m.ingestErrors).toEqual(["TOR announcement ann-tor has no attached file"]);
  });

  it("omits budget/referencePrice when the API returns null", () => {
    const m = mapProject(project, { ...detail, projectBudget: null, projectAverageBudget: null }, [torAnn], OPTS);
    expect(m.set.budget).toBeUndefined();
    expect(m.set.referencePrice).toBeUndefined();
  });
});

describe("canonicalDetailHash", () => {
  it("is stable regardless of key order and changes when a field changes", () => {
    const a = canonicalDetailHash(detail);
    const reordered: EgpProjectDetail = JSON.parse(
      JSON.stringify({
        masterContractAvailableName: detail.masterContractAvailableName,
        projectName: detail.projectName,
        projectBudget: detail.projectBudget,
        projectAverageBudget: detail.projectAverageBudget,
        masterOrgGroupName: detail.masterOrgGroupName,
        masterOrgDepartmentName: detail.masterOrgDepartmentName,
        masterMethodIdName: detail.masterMethodIdName,
        masterTypeIdName: detail.masterTypeIdName,
        masterGoodsIdName: detail.masterGoodsIdName,
      })
    );
    expect(canonicalDetailHash(reordered)).toBe(a);
    expect(canonicalDetailHash({ ...detail, projectBudget: 1 })).not.toBe(a);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/ingestion/__tests__/mapProject.test.ts`
Expected: FAIL — `Cannot find module '../mapProject'`.

- [ ] **Step 3: Write mapProject**

Create `backend/src/ingestion/mapProject.ts`:

```ts
import { createHash } from "node:crypto";
import type {
  EgpAnnouncement,
  EgpProjectDetail,
  EgpSearchProject,
} from "../scraper/egpClient.types";

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
  set: MappedProjectSet;
  torAnnouncement: TorAnnouncementRef | null;
  ingestErrors: string[];
}

const TOR_KIND_PREFIX = "ร่างขอบเขตของงาน";

/** sha256 of the detail fields we persist, with a fixed key order. */
export function canonicalDetailHash(detail: EgpProjectDetail): string {
  const ordered = [
    detail.projectName,
    detail.masterOrgGroupName,
    detail.masterOrgDepartmentName,
    detail.projectBudget,
    detail.projectAverageBudget,
    detail.masterMethodIdName,
    detail.masterTypeIdName,
    detail.masterGoodsIdName,
    detail.masterContractAvailableName,
  ];
  return createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
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
  opts: { fileBase: string; listingBase: string }
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
    set,
    torAnnouncement,
    ingestErrors,
  };
}

export default mapProject;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/ingestion/__tests__/mapProject.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/ingestion/mapProject.ts backend/src/ingestion/__tests__/mapProject.test.ts
git commit -m "feat(ingestion): map e-GP projects to Tor upsert payloads

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Fetch and store one TOR PDF

**Files:**
- Create: `backend/src/ingestion/fetchAndStoreTorPdf.ts`
- Test: `backend/src/ingestion/__tests__/fetchAndStoreTorPdf.test.ts`

**Interfaces:**
- Consumes: `EgpClientLike` (Task 5), `BlobStorage` (Task 2), `pdfInspect` / `PdfParseFn` (Task 4), `TorAnnouncementRef` (Task 7), `logIngestionEvent` (Task 6), `Tor` / `ITor` (Task 1)
- Produces:
  - `interface FetchTorPdfDeps { client: EgpClientLike; storage: BlobStorage; parse?: PdfParseFn }`
  - `function fetchAndStoreTorPdf(tor: import("mongoose").HydratedDocument<ITor>, ann: TorAnnouncementRef, ingestionRunId: import("mongoose").Types.ObjectId, deps: FetchTorPdfDeps): Promise<void>` — sets `tor.sourceDocument` + `tor.sourceDocumentUrl`, saves; on download failure sets `textLayer: "missing"`, `storageKey: null`, logs an error, still saves, never throws

- [ ] **Step 1: Write the failing test**

Create `backend/src/ingestion/__tests__/fetchAndStoreTorPdf.test.ts`:

```ts
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Tor, SystemLog } from "../../models";
import type { EgpClientLike } from "../../scraper/egpClient.types";
import type { BlobStorage } from "../../storage/storage.types";
import type { TorAnnouncementRef } from "../mapProject";
import { fetchAndStoreTorPdf } from "../fetchAndStoreTorPdf";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Tor.deleteMany({});
  await SystemLog.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const ANN: TorAnnouncementRef = {
  announcementId: "ann-tor",
  filename: "tor.pdf",
  egpUrl: "https://egp.test/api/file/ann-tor/tor.pdf",
  publishedAt: new Date("2026-08-23T00:00:00Z"),
};

function fakeStorage(): BlobStorage & { saved: Map<string, Buffer> } {
  const saved = new Map<string, Buffer>();
  return {
    saved,
    async put(key, body) {
      saved.set(key, body);
      return { key, size: body.length };
    },
    async getStream() {
      throw new Error("not used");
    },
    async exists(key) {
      return saved.has(key);
    },
    publicUrl() {
      return null;
    },
  };
}

function clientReturning(buf: Buffer): EgpClientLike {
  return {
    searchProjects: jest.fn(),
    projectDetail: jest.fn(),
    announcements: jest.fn(),
    downloadFile: jest.fn().mockResolvedValue(buf),
  } as unknown as EgpClientLike;
}

describe("fetchAndStoreTorPdf", () => {
  it("stores the pdf under the key scheme and records sourceDocument", async () => {
    const tor = await Tor.create({ title: "t", projectCode: "69000000001" });
    const storage = fakeStorage();
    const runId = new mongoose.Types.ObjectId();

    await fetchAndStoreTorPdf(tor, ANN, runId, {
      client: clientReturning(Buffer.from("%PDF bytes")),
      storage,
      parse: async () => ({ numpages: 10, text: "x".repeat(5000) }),
    });

    const key = "tor-pdfs/69000000001/ann-tor.pdf";
    expect(storage.saved.has(key)).toBe(true);

    const saved = await Tor.findById(tor._id).lean();
    expect(saved?.sourceDocument).toMatchObject({
      egpUrl: ANN.egpUrl,
      filename: "tor.pdf",
      storageKey: key,
      textLayer: "digital",
      pageCount: 10,
      byteSize: 9,
    });
    expect(saved?.sourceDocument?.sha256).toHaveLength(64);
    expect(saved?.sourceDocumentUrl).toBe(`/api/tors/${tor._id.toString()}/document`);
  });

  it("marks the document missing and logs an error when the download fails", async () => {
    const tor = await Tor.create({ title: "t", projectCode: "69000000002" });
    const storage = fakeStorage();
    const client = {
      searchProjects: jest.fn(),
      projectDetail: jest.fn(),
      announcements: jest.fn(),
      downloadFile: jest.fn().mockRejectedValue(new Error("e-GP 404")),
    } as unknown as EgpClientLike;
    const runId = new mongoose.Types.ObjectId();

    await expect(fetchAndStoreTorPdf(tor, ANN, runId, { client, storage })).resolves.toBeUndefined();

    const saved = await Tor.findById(tor._id).lean();
    expect(saved?.sourceDocument).toMatchObject({ storageKey: null, textLayer: "missing" });
    expect(storage.saved.size).toBe(0);

    const errors = await SystemLog.find({ severity: "error" }).lean();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.ingestionRunId?.toString()).toBe(runId.toString());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/ingestion/__tests__/fetchAndStoreTorPdf.test.ts`
Expected: FAIL — `Cannot find module '../fetchAndStoreTorPdf'`.

- [ ] **Step 3: Write fetchAndStoreTorPdf**

Create `backend/src/ingestion/fetchAndStoreTorPdf.ts`:

```ts
import { createHash } from "node:crypto";
import type { HydratedDocument, Types } from "mongoose";
import type { ITor } from "../models/Tor";
import type { EgpClientLike } from "../scraper/egpClient.types";
import type { BlobStorage } from "../storage/storage.types";
import { pdfInspect, type PdfParseFn } from "./pdfInspect";
import { logIngestionEvent } from "./log";
import type { TorAnnouncementRef } from "./mapProject";

export interface FetchTorPdfDeps {
  client: EgpClientLike;
  storage: BlobStorage;
  parse?: PdfParseFn;
}

/**
 * Download the TOR PDF for `tor`, inspect its text layer, store the bytes, and
 * record everything on `tor.sourceDocument`. A fetch failure is recorded (the
 * record is marked "missing" per FR-11) rather than thrown.
 */
export async function fetchAndStoreTorPdf(
  tor: HydratedDocument<ITor>,
  ann: TorAnnouncementRef,
  ingestionRunId: Types.ObjectId,
  deps: FetchTorPdfDeps
): Promise<void> {
  const now = new Date();
  let buf: Buffer;
  try {
    buf = await deps.client.downloadFile(ann.announcementId, ann.filename);
  } catch (err) {
    tor.sourceDocument = {
      egpUrl: ann.egpUrl,
      filename: ann.filename,
      storageKey: null,
      textLayer: "missing",
      pageCount: null,
      byteSize: null,
      sha256: null,
      fetchedAt: now,
    };
    await tor.save();
    await logIngestionEvent({
      severity: "error",
      message: `TOR pdf download failed for ${tor.projectCode ?? tor.id}: ${(err as Error).message}`,
      component: "fetchAndStoreTorPdf",
      context: { announcementId: ann.announcementId },
      ingestionRunId,
    });
    return;
  }

  const sha256 = createHash("sha256").update(buf).digest("hex");
  const { pageCount, textLayer } = await pdfInspect(buf, deps.parse);
  const key = `tor-pdfs/${tor.projectCode ?? tor.id}/${ann.announcementId}.pdf`;

  await deps.storage.put(key, buf, { contentType: "application/pdf" });

  tor.sourceDocument = {
    egpUrl: ann.egpUrl,
    filename: ann.filename,
    storageKey: key,
    textLayer,
    pageCount,
    byteSize: buf.length,
    sha256,
    fetchedAt: now,
  };
  tor.sourceDocumentUrl = deps.storage.publicUrl(key) ?? `/api/tors/${tor.id}/document`;
  await tor.save();
}

export default fetchAndStoreTorPdf;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/ingestion/__tests__/fetchAndStoreTorPdf.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/ingestion/fetchAndStoreTorPdf.ts backend/src/ingestion/__tests__/fetchAndStoreTorPdf.test.ts
git commit -m "feat(ingestion): download, inspect, and store the TOR pdf

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: The ingestion orchestrator

**Files:**
- Create: `backend/src/ingestion/runIngestion.ts`
- Modify: `backend/.env.example`
- Test: `backend/src/ingestion/__tests__/runIngestion.test.ts`

**Interfaces:**
- Consumes: `EgpClient` / `egpConfigFromEnv` / `EgpClientLike` (Task 5), `getStorage` (Task 3), `mapProject` (Task 7), `fetchAndStoreTorPdf` (Task 8), `logIngestionEvent` (Task 6), `Tor` / `IngestionRun` (Tasks 1 + existing), `TOR_TYPE_ID` (Task 5)
- Produces:
  - `interface RunIngestionOptions { trigger: "manual" | "scheduled"; triggeredBy: string | null; maxProjects: number; searchText: string; announceAllTypes?: boolean }`
  - `interface RunIngestionDeps { client?: EgpClientLike; storage?: BlobStorage; parse?: PdfParseFn }`
  - `interface RunIngestionResult { runId: string; done: Promise<void> }`
  - `function runIngestion(opts: RunIngestionOptions, deps?: RunIngestionDeps): Promise<RunIngestionResult>` — creates the `IngestionRun`, returns its id plus a `done` promise for the background crawl (production ignores `done`; tests await it)

- [ ] **Step 1: Write the failing test**

Create `backend/src/ingestion/__tests__/runIngestion.test.ts`:

```ts
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Tor, IngestionRun, SystemLog } from "../../models";
import type {
  EgpAnnouncement,
  EgpClientLike,
  EgpProjectDetail,
  EgpSearchProject,
} from "../../scraper/egpClient.types";
import type { BlobStorage } from "../../storage/storage.types";
import { runIngestion } from "../runIngestion";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Promise.all([Tor.deleteMany({}), IngestionRun.deleteMany({}), SystemLog.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const projects: EgpSearchProject[] = [
  { projectId: "p-1", projectNumber: "69000000001" },
  { projectId: "p-2", projectNumber: "69000000002" },
];

function detailFor(name: string): EgpProjectDetail {
  return {
    projectName: name,
    masterOrgGroupName: "สำนักการแพทย์",
    masterOrgDepartmentName: "โรงพยาบาลกลาง",
    projectBudget: 1_000_000,
    projectAverageBudget: 950_000,
    masterMethodIdName: "ประกวดราคา",
    masterTypeIdName: "จ้าง",
    masterGoodsIdName: "งานจ้างพัฒนาระบบ",
    masterContractAvailableName: "ระหว่างดำเนินการ",
  };
}

const torAnnFor = (id: string): EgpAnnouncement[] => [
  {
    id: `ann-${id}`,
    masterAnnounceTypeName: "ร่างขอบเขตของงาน (TOR)",
    projectAnnouncementPublishDate: "2026-08-23T17:00:00Z",
    projectAnnouncementPath: "tor.pdf",
  },
];

function fakeStorage(): BlobStorage {
  const saved = new Map<string, Buffer>();
  return {
    async put(key, body) {
      saved.set(key, body);
      return { key, size: body.length };
    },
    async getStream() {
      throw new Error("unused");
    },
    async exists(key) {
      return saved.has(key);
    },
    publicUrl() {
      return null;
    },
  };
}

interface FakeClientOpts {
  detailNames?: Record<string, string>;
  failDetailFor?: string;
}

function fakeClient(opts: FakeClientOpts = {}): EgpClientLike {
  return {
    async searchProjects({ page }) {
      return page === 1
        ? { totalCount: 2, hasNextPage: false, data: projects }
        : { totalCount: 2, hasNextPage: false, data: [] };
    },
    async projectDetail(projectId) {
      if (opts.failDetailFor === projectId) throw new Error("e-GP 500");
      const num = projects.find((p) => p.projectId === projectId)?.projectNumber ?? "?";
      return detailFor(opts.detailNames?.[projectId] ?? `โครงการ ${num}`);
    },
    async announcements(projectId) {
      return torAnnFor(projectId);
    },
    async downloadFile() {
      return Buffer.from("%PDF-1.4 bytes");
    },
  };
}

const baseOpts = {
  trigger: "manual" as const,
  triggeredBy: null,
  maxProjects: 50,
  searchText: "ซอฟต์แวร์",
};

const parse = async () => ({ numpages: 3, text: "x".repeat(50) }); // -> scanned

describe("runIngestion", () => {
  it("creates a Tor per project, stores its pdf, and finishes the run as success", async () => {
    const { runId, done } = await runIngestion(baseOpts, { client: fakeClient(), storage: fakeStorage(), parse });
    await done;

    const tors = await Tor.find({}).sort({ projectCode: 1 }).lean();
    expect(tors.map((t) => t.projectCode)).toEqual(["69000000001", "69000000002"]);
    expect(tors[0]?.sourceDocument?.textLayer).toBe("scanned");
    expect(tors[0]?.sourceContentHash).toHaveLength(64);

    const run = await IngestionRun.findById(runId).lean();
    expect(run?.status).toBe("success");
    expect(run?.stats).toMatchObject({ torsFound: 2, torsCreated: 2, torsUpdated: 0, torsFailed: 0 });
    expect(run?.completedAt).toBeTruthy();
  });

  it("is idempotent — a second run with unchanged detail creates and updates nothing", async () => {
    const deps = { client: fakeClient(), storage: fakeStorage(), parse };
    await (await runIngestion(baseOpts, deps)).done;
    const { runId, done } = await runIngestion(baseOpts, deps);
    await done;

    expect(await Tor.countDocuments({})).toBe(2);
    const run = await IngestionRun.findById(runId).lean();
    expect(run?.stats).toMatchObject({ torsCreated: 0, torsUpdated: 0 });
  });

  it("updates a Tor when the e-GP detail changed", async () => {
    const deps1 = { client: fakeClient(), storage: fakeStorage(), parse };
    await (await runIngestion(baseOpts, deps1)).done;

    const deps2 = {
      client: fakeClient({ detailNames: { "p-1": "โครงการ 69000000001 (แก้ไข)" } }),
      storage: fakeStorage(),
      parse,
    };
    const { runId, done } = await runIngestion(baseOpts, deps2);
    await done;

    const run = await IngestionRun.findById(runId).lean();
    expect(run?.stats).toMatchObject({ torsCreated: 0, torsUpdated: 1 });
    const t = await Tor.findOne({ projectCode: "69000000001" }).lean();
    expect(t?.title).toBe("โครงการ 69000000001 (แก้ไข)");
  });

  it("records a per-project failure, logs it, and finishes partial", async () => {
    const { runId, done } = await runIngestion(baseOpts, {
      client: fakeClient({ failDetailFor: "p-1" }),
      storage: fakeStorage(),
      parse,
    });
    await done;

    const run = await IngestionRun.findById(runId).lean();
    expect(run?.status).toBe("partial");
    expect(run?.stats).toMatchObject({ torsFound: 2, torsCreated: 1, torsFailed: 1 });
    expect(await Tor.countDocuments({})).toBe(1);

    const errs = await SystemLog.find({ severity: "error", ingestionRunId: runId }).lean();
    expect(errs.length).toBeGreaterThanOrEqual(1);
  });

  it("honours maxProjects", async () => {
    const { done, runId } = await runIngestion(
      { ...baseOpts, maxProjects: 1 },
      { client: fakeClient(), storage: fakeStorage(), parse }
    );
    await done;
    expect(await Tor.countDocuments({})).toBe(1);
    const run = await IngestionRun.findById(runId).lean();
    expect(run?.stats.torsFound).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/ingestion/__tests__/runIngestion.test.ts`
Expected: FAIL — `Cannot find module '../runIngestion'`.

- [ ] **Step 3: Write runIngestion**

Create `backend/src/ingestion/runIngestion.ts`:

```ts
import type { Types } from "mongoose";
import { Tor, IngestionRun } from "../models";
import { EgpClient, egpConfigFromEnv, listingUrl } from "../scraper/egpClient";
import { TOR_TYPE_ID, type EgpClientLike } from "../scraper/egpClient.types";
import { getStorage } from "../storage";
import type { BlobStorage } from "../storage/storage.types";
import { mapProject } from "./mapProject";
import { fetchAndStoreTorPdf } from "./fetchAndStoreTorPdf";
import { logIngestionEvent } from "./log";
import type { PdfParseFn } from "./pdfInspect";

export interface RunIngestionOptions {
  trigger: "manual" | "scheduled";
  triggeredBy: string | null;
  maxProjects: number;
  searchText: string;
  announceAllTypes?: boolean;
}

export interface RunIngestionDeps {
  client?: EgpClientLike;
  storage?: BlobStorage;
  parse?: PdfParseFn;
}

export interface RunIngestionResult {
  runId: string;
  done: Promise<void>;
}

const PAGE_SIZE = 50;

async function collectProjects(
  client: EgpClientLike,
  opts: RunIngestionOptions
): Promise<{ projectId: string; projectNumber: string }[]> {
  const out: { projectId: string; projectNumber: string }[] = [];
  for (let page = 1; out.length < opts.maxProjects; page += 1) {
    const batch = await client.searchProjects({
      page,
      pageSize: PAGE_SIZE,
      announceTypeId: opts.announceAllTypes ? null : TOR_TYPE_ID,
      searchText: opts.searchText,
    });
    out.push(...batch.data.map((p) => ({ projectId: p.projectId, projectNumber: p.projectNumber })));
    if (!batch.hasNextPage || batch.data.length === 0) break;
  }
  return out.slice(0, opts.maxProjects);
}

async function processProject(
  project: { projectId: string; projectNumber: string },
  runId: Types.ObjectId,
  client: EgpClientLike,
  storage: BlobStorage,
  parse: PdfParseFn | undefined,
  stats: { torsCreated: number; torsUpdated: number }
): Promise<void> {
  const detail = await client.projectDetail(project.projectId);
  const announcements = await client.announcements(project.projectId);
  const mapped = mapProject(project, detail, announcements, {
    fileBase: egpConfigFromEnv().fileBase,
    listingBase: listingUrl("", process.env).replace(/\/$/, ""),
  });

  let tor = await Tor.findOne({ projectCode: mapped.projectCode });
  if (!tor) {
    tor = await Tor.create({ ...mapped.set, projectCode: mapped.projectCode, sourceContentHash: mapped.sourceContentHash, ingestionRunId: runId });
    stats.torsCreated += 1;
  } else if (tor.sourceContentHash !== mapped.sourceContentHash) {
    tor.set({ ...mapped.set, sourceContentHash: mapped.sourceContentHash, ingestionRunId: runId });
    await tor.save();
    stats.torsUpdated += 1;
  }

  for (const message of mapped.ingestErrors) {
    await logIngestionEvent({ severity: "warning", message, component: "runIngestion", ingestionRunId: runId });
  }

  if (mapped.torAnnouncement) {
    await fetchAndStoreTorPdf(tor, mapped.torAnnouncement, runId, { client, storage, parse });
  }
}

async function crawl(
  runId: Types.ObjectId,
  opts: RunIngestionOptions,
  client: EgpClientLike,
  storage: BlobStorage,
  parse: PdfParseFn | undefined
): Promise<void> {
  const run = await IngestionRun.findById(runId);
  if (!run) return;
  const stats = { torsCreated: 0, torsUpdated: 0 };
  let torsFailed = 0;

  try {
    const projects = await collectProjects(client, opts);
    run.stats.torsFound = projects.length;
    await run.save();

    for (const project of projects) {
      try {
        await processProject(project, runId, client, storage, parse, stats);
      } catch (err) {
        torsFailed += 1;
        await logIngestionEvent({
          severity: "error",
          message: `project ${project.projectNumber} failed: ${(err as Error).message}`,
          component: "runIngestion",
          context: { projectId: project.projectId, stack: (err as Error).stack },
          ingestionRunId: runId,
        });
      }
    }

    run.stats.torsCreated = stats.torsCreated;
    run.stats.torsUpdated = stats.torsUpdated;
    run.stats.torsFailed = torsFailed;
    run.completedAt = new Date();
    run.status =
      torsFailed === 0 ? "success" : torsFailed === run.stats.torsFound ? "failed" : "partial";
    run.outcomeSummary = `found ${run.stats.torsFound}, created ${stats.torsCreated}, updated ${stats.torsUpdated}, failed ${torsFailed}`;
    await run.save();
    await logIngestionEvent({ severity: "info", message: run.outcomeSummary, component: "runIngestion", ingestionRunId: runId });
  } catch (fatal) {
    run.completedAt = new Date();
    run.status = "failed";
    run.outcomeSummary = `run aborted: ${(fatal as Error).message}`;
    await run.save();
    await logIngestionEvent({
      severity: "error",
      message: run.outcomeSummary,
      component: "runIngestion",
      context: { stack: (fatal as Error).stack },
      ingestionRunId: runId,
    });
  }
}

/**
 * Start an ingestion run. Creates the IngestionRun row synchronously and returns
 * its id; the crawl itself runs in the background. `done` resolves when the crawl
 * finishes — production ignores it, tests await it.
 */
export async function runIngestion(
  opts: RunIngestionOptions,
  deps: RunIngestionDeps = {}
): Promise<RunIngestionResult> {
  const client = deps.client ?? new EgpClient(egpConfigFromEnv());
  const storage = deps.storage ?? getStorage();

  const run = await IngestionRun.create({
    trigger: opts.trigger,
    triggeredBy: opts.triggeredBy,
    status: "running",
  });

  const done = crawl(run._id as Types.ObjectId, opts, client, storage, deps.parse);
  void done.catch(() => undefined); // never surfaces as an unhandled rejection

  return { runId: (run._id as Types.ObjectId).toString(), done };
}

export default runIngestion;
```

Note on `listingBase`: `listingUrl("", env)` yields `".../project-detail/"`; the `.replace(/\/$/, "")` trims the trailing slash so `mapProject` can re-append `/${projectId}`. Keep this exactly.

- [ ] **Step 4: Add ingestion default env vars**

In `backend/.env.example`, under the `# e-GP ingestion scraper` block, append:

```
INGEST_DEFAULT_SEARCH=ซอฟต์แวร์
INGEST_DEFAULT_MAX_PROJECTS=50
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest src/ingestion/__tests__/runIngestion.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Full test + typecheck**

Run: `cd backend && npm run typecheck && npm test`
Expected: all suites pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/ingestion/runIngestion.ts backend/src/ingestion/__tests__/runIngestion.test.ts backend/.env.example
git commit -m "feat(ingestion): add the ingestion run orchestrator

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: Ingestion REST endpoints

**Files:**
- Create: `backend/src/controllers/ingestionController.ts`
- Create: `backend/src/routes/ingestionRoutes.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/src/__tests__/ingestionRoutes.test.ts`

**Interfaces:**
- Consumes: `runIngestion` (Task 9), `requireAuth` / `requireRole` (existing), `httpError` (existing), `IngestionRun` (existing)
- Produces:
  - `createRun(req: Request, res: Response): Promise<void>` — `POST /api/ingestion/runs`; validates body `{ maxProjects?, searchText?, announceAllTypes? }`; `202 { runId, status: "running" }`
  - `listRuns(req: Request, res: Response): Promise<void>` — `GET /api/ingestion/runs?limit=`; `200 { runs }`
  - `getRun(req: Request, res: Response): Promise<void>` — `GET /api/ingestion/runs/:id`; `200 { run }` or `404`

- [ ] **Step 1: Write the failing test**

Create `backend/src/__tests__/ingestionRoutes.test.ts`:

```ts
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";

const runIngestionMock = jest.fn();
jest.mock("../ingestion/runIngestion", () => ({
  runIngestion: (...args: unknown[]) => runIngestionMock(...args),
}));

import app from "../app";
import { User } from "../models";
import { IngestionRun } from "../models";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await User.deleteMany({});
  await IngestionRun.deleteMany({});
  jest.clearAllMocks();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function adminAgent() {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email: "admin@test.com", password: "secret123" });
  await User.updateOne({ email: "admin@test.com" }, { role: "admin" });
  // re-login so the session cookie carries role=admin
  await agent.post("/api/auth/login").send({ email: "admin@test.com", password: "secret123" });
  return agent;
}

describe("POST /api/ingestion/runs", () => {
  it("401 without a session", async () => {
    const res = await request(app).post("/api/ingestion/runs").send({});
    expect(res.status).toBe(401);
  });

  it("403 for a vendor", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "v@test.com", password: "secret123" });
    const res = await agent.post("/api/ingestion/runs").send({});
    expect(res.status).toBe(403);
  });

  it("202 with a runId for an admin and calls runIngestion once", async () => {
    runIngestionMock.mockResolvedValue({ runId: "run-123", done: Promise.resolve() });
    const agent = await adminAgent();

    const res = await agent.post("/api/ingestion/runs").send({ maxProjects: 5, searchText: "ระบบ" });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ runId: "run-123", status: "running" });
    expect(runIngestionMock).toHaveBeenCalledTimes(1);
    expect(runIngestionMock.mock.calls[0][0]).toMatchObject({
      trigger: "manual",
      maxProjects: 5,
      searchText: "ระบบ",
    });
  });

  it("400 when maxProjects is out of range", async () => {
    const agent = await adminAgent();
    const res = await agent.post("/api/ingestion/runs").send({ maxProjects: 9999 });
    expect(res.status).toBe(400);
    expect(runIngestionMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/ingestion/runs", () => {
  it("lists runs newest first for an admin", async () => {
    const agent = await adminAgent();
    await IngestionRun.create({ trigger: "manual", startedAt: new Date("2026-08-01"), status: "success" });
    await IngestionRun.create({ trigger: "manual", startedAt: new Date("2026-08-10"), status: "failed" });

    const res = await agent.get("/api/ingestion/runs");
    expect(res.status).toBe(200);
    expect(res.body.runs).toHaveLength(2);
    expect(res.body.runs[0].status).toBe("failed");
  });

  it("404 for an unknown run id", async () => {
    const agent = await adminAgent();
    const res = await agent.get(`/api/ingestion/runs/${new mongoose.Types.ObjectId().toString()}`);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/__tests__/ingestionRoutes.test.ts`
Expected: FAIL — routes not mounted (404s where 401/403/202 expected) / `Cannot find module`.

- [ ] **Step 3: Write the controller**

Create `backend/src/controllers/ingestionController.ts`:

```ts
import type { Request, Response } from "express";
import { IngestionRun } from "../models";
import { httpError } from "../utils/httpError";
import { runIngestion } from "../ingestion/runIngestion";

const MAX_PROJECTS_CEILING = 500;

function parseMaxProjects(raw: unknown): number {
  const fallback = Number(process.env.INGEST_DEFAULT_MAX_PROJECTS) || 50;
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PROJECTS_CEILING) {
    throw httpError(400, `maxProjects must be an integer between 1 and ${MAX_PROJECTS_CEILING}`);
  }
  return n;
}

function parseSearchText(raw: unknown): string {
  if (raw === undefined) return process.env.INGEST_DEFAULT_SEARCH ?? "ซอฟต์แวร์";
  if (typeof raw !== "string" || raw.length > 200) {
    throw httpError(400, "searchText must be a string of at most 200 characters");
  }
  return raw;
}

/** POST /api/ingestion/runs — admin-triggered ingestion (FR-35). */
export async function createRun(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const maxProjects = parseMaxProjects(body.maxProjects);
  const searchText = parseSearchText(body.searchText);
  const announceAllTypes = body.announceAllTypes === true;

  const { runId } = await runIngestion({
    trigger: "manual",
    triggeredBy: req.user!.id,
    maxProjects,
    searchText,
    announceAllTypes,
  });

  res.status(202).json({ runId, status: "running" });
}

/** GET /api/ingestion/runs — recent run history (FR-34). */
export async function listRuns(req: Request, res: Response): Promise<void> {
  const limitRaw = Number(req.query.limit);
  const limit = Number.isInteger(limitRaw) && limitRaw >= 1 && limitRaw <= 100 ? limitRaw : 20;
  const runs = await IngestionRun.find({}).sort({ startedAt: -1 }).limit(limit).lean();
  res.status(200).json({ runs });
}

/** GET /api/ingestion/runs/:id — one run. */
export async function getRun(req: Request, res: Response): Promise<void> {
  const run = await IngestionRun.findById(req.params.id).lean();
  if (!run) throw httpError(404, "Ingestion run not found");
  res.status(200).json({ run });
}
```

- [ ] **Step 4: Write the routes**

Create `backend/src/routes/ingestionRoutes.ts`:

```ts
import { Router } from "express";
import { createRun, listRuns, getRun } from "../controllers/ingestionController";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requireRole("admin"));

router.post("/runs", createRun);
router.get("/runs", listRuns);
router.get("/runs/:id", getRun);

export default router;
```

- [ ] **Step 5: Mount in app.ts**

In `backend/src/app.ts`, add the import beside the other route imports:

```ts
import ingestionRoutes from "./routes/ingestionRoutes";
```

and the mount line right after `app.use("/api/auth", authRoutes);`:

```ts
app.use("/api/ingestion", ingestionRoutes);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx jest src/__tests__/ingestionRoutes.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add backend/src/controllers/ingestionController.ts backend/src/routes/ingestionRoutes.ts backend/src/app.ts backend/src/__tests__/ingestionRoutes.test.ts
git commit -m "feat(ingestion): add admin endpoints to trigger and list runs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: Stream the stored TOR PDF

**Files:**
- Create: `backend/src/controllers/torDocumentController.ts`
- Create: `backend/src/routes/torRoutes.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/src/__tests__/torDocument.test.ts`

**Interfaces:**
- Consumes: `Tor` (Task 1), `getStorage` / `setStorageForTest` (Task 3), `httpError` (existing)
- Produces:
  - `streamTorDocument(req: Request, res: Response): Promise<void>` — `GET /api/tors/:id/document`; streams the blob with `Content-Type: application/pdf` and `Content-Disposition: inline`; `404` when the TOR or its `sourceDocument.storageKey` is missing. Public (no auth).

- [ ] **Step 1: Write the failing test**

Create `backend/src/__tests__/torDocument.test.ts`:

```ts
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Readable } from "node:stream";

import app from "../app";
import { Tor } from "../models";
import { setStorageForTest } from "../storage";
import type { BlobStorage } from "../storage/storage.types";

let mongod: MongoMemoryServer;

const PDF_BYTES = Buffer.from("%PDF-1.4 stored bytes");

const fakeStore: BlobStorage = {
  async put(key, body) {
    return { key, size: body.length };
  },
  async getStream(key) {
    if (key !== "tor-pdfs/69000000001/ann-1.pdf") throw new Error("missing");
    return Readable.from([PDF_BYTES]);
  },
  async exists() {
    return true;
  },
  publicUrl() {
    return null;
  },
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  setStorageForTest(fakeStore);
});

afterEach(async () => {
  await Tor.deleteMany({});
});

afterAll(async () => {
  setStorageForTest(null);
  await mongoose.disconnect();
  await mongod.stop();
});

describe("GET /api/tors/:id/document", () => {
  it("streams the stored pdf", async () => {
    const tor = await Tor.create({
      title: "t",
      projectCode: "69000000001",
      sourceDocument: {
        egpUrl: "u",
        filename: "tor.pdf",
        storageKey: "tor-pdfs/69000000001/ann-1.pdf",
        textLayer: "scanned",
        pageCount: 3,
        byteSize: PDF_BYTES.length,
        sha256: "c".repeat(64),
        fetchedAt: new Date(),
      },
    });

    const res = await request(app).get(`/api/tors/${tor._id.toString()}/document`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(res.headers["content-disposition"]).toMatch(/inline/);
    expect((res.body as Buffer).equals(PDF_BYTES)).toBe(true);
  });

  it("404 when the TOR has no stored document", async () => {
    const tor = await Tor.create({ title: "t", projectCode: "69000000002" });
    const res = await request(app).get(`/api/tors/${tor._id.toString()}/document`);
    expect(res.status).toBe(404);
  });

  it("404 for an unknown TOR id", async () => {
    const res = await request(app).get(`/api/tors/${new mongoose.Types.ObjectId().toString()}/document`);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/__tests__/torDocument.test.ts`
Expected: FAIL — route not mounted (404 with the "Not found" body for all three, so the content-type/stream assertion fails).

- [ ] **Step 3: Write the controller**

Create `backend/src/controllers/torDocumentController.ts`:

```ts
import type { Request, Response } from "express";
import { Tor } from "../models";
import { getStorage } from "../storage";
import { httpError } from "../utils/httpError";

/** GET /api/tors/:id/document — stream our stored copy of the TOR PDF (FR-05). */
export async function streamTorDocument(req: Request, res: Response): Promise<void> {
  const tor = await Tor.findById(req.params.id).lean();
  const key = tor?.sourceDocument?.storageKey;
  if (!tor || !key) throw httpError(404, "No stored document for this TOR");

  let stream: NodeJS.ReadableStream;
  try {
    stream = await getStorage().getStream(key);
  } catch {
    throw httpError(404, "Stored document is unavailable");
  }

  const filename = encodeURIComponent(tor.sourceDocument?.filename ?? "tor.pdf");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}
```

- [ ] **Step 4: Write the routes**

Create `backend/src/routes/torRoutes.ts`:

```ts
import { Router } from "express";
import { streamTorDocument } from "../controllers/torDocumentController";

const router = Router();

// TOR search / detail endpoints land here later; for now just the document stream.
router.get("/:id/document", streamTorDocument);

export default router;
```

- [ ] **Step 5: Mount in app.ts**

In `backend/src/app.ts`, add beside the route imports:

```ts
import torRoutes from "./routes/torRoutes";
```

and the mount line right after `app.use("/api/ingestion", ingestionRoutes);`:

```ts
app.use("/api/tors", torRoutes);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx jest src/__tests__/torDocument.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Full test + typecheck + build**

Run: `cd backend && npm run typecheck && npm test && npm run build`
Expected: all suites pass; `tsc` emits `dist/` with no errors.

- [ ] **Step 8: Commit**

```bash
git add backend/src/controllers/torDocumentController.ts backend/src/routes/torRoutes.ts backend/src/app.ts backend/src/__tests__/torDocument.test.ts
git commit -m "feat(ingestion): stream the stored TOR pdf over the api

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 12: Wire-up doc note

**Files:**
- Modify: `CLAUDE.md`
- Test: none (documentation)

- [ ] **Step 1: Document the ingestion surface**

In `CLAUDE.md`, under "Architecture notes that span files", add a subsection:

```markdown
### TOR ingestion (`backend/src/scraper/` + `backend/src/ingestion/`)
`munyin.py` was a throwaway prototype; the real ingestion path is in the TS backend.
`POST /api/ingestion/runs` (admin) creates an `IngestionRun` and kicks off
`runIngestion` in-process — it pages the e-GP API (`scraper/egpClient.ts`), upserts
`Tor` docs keyed by `projectCode` with change detection via `sourceContentHash`, and
downloads each TOR PDF through the `BlobStorage` adapter (`storage/`, `STORAGE_DRIVER`
= `local` now, `gcs` later). `pdfInspect` tags each file `digital` / `scanned` /
`unreadable` / `missing`; OCR and AI stages consume that later. Binaries never go in
Mongo. Progress and errors land in `IngestionRun` + `SystemLog` (source `ingestion`).
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(ingestion): describe the ingestion surface in CLAUDE.md

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task(s) |
|---|---|
| §3 download not hot-link | Tasks 8, 11 (store bytes, serve from our store) |
| §4 in-process orchestrator + file list | Tasks 2–11 (every listed file created/modified) |
| §5 e-GP API surface + politeness | Task 5 |
| §6 Tor model changes + field mapping | Tasks 1 (schema), 7 (mapping) |
| §7 run flow, create/update/unchanged, per-project error → partial | Task 9 |
| §7 fetchAndStoreTorPdf incl. "missing" on failure | Task 8 |
| §8 pdfInspect + threshold | Task 4 |
| §9 storage adapter, key scheme, local + gcs stub, getStorage | Tasks 2, 3 |
| §10 endpoints + auth + 202 + public document stream | Tasks 10, 11 |
| §11 env vars | Tasks 2 (storage), 5 (e-GP), 9 (INGEST_DEFAULT_*) |
| §12 M0 note | N/A (analysis only, no code) |
| §13 testing | every task's test file; idempotency + partial covered in Task 9 |
| §14 deps (`pdf-parse`, dev `pdf-lib`) | Task 4 |
| §15 future-proofing (`trigger` param, `processProject` unit) | Task 9 structure |
| §16 assumptions | carried; branch off `main` done |

No gaps.

**2. Placeholder scan** — no "TBD"/"add error handling"/"similar to Task N"; every code step has full code. The `<contact-email>` token is inside `.env.example` sample text, intentional.

**3. Type consistency** — `MappedProject` / `TorAnnouncementRef` names match across Tasks 7→8→9. `BlobStorage` method set (`put`/`getStream`/`exists`/`publicUrl`) identical in Tasks 2, 3, 8, 9, 11. `ISourceDocument` field set identical in Task 1 schema and the object literals in Task 8. `runIngestion` returns `{ runId, done }` in Task 9 and both consumers (Task 10 uses `runId`; tests use `done`) match. `RunIngestionOptions.triggeredBy: string | null` matches `req.user!.id` (string) in Task 10 and `null` for scheduled.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-29-tor-ingestion-backend.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
