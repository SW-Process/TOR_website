# Fairness Flag Detection — Design

Date: 2026-09-08
Status: approved, ready for implementation plan

## Context

`Tor.fairnessFlags` (an embedded `DocumentArray` of `{ field, severity, message,
detectedAt, status }`) has existed in the schema since before the AI enrichment
pipeline was built, but nothing has ever written to it. The enrichment pipeline
design (`2026-08-31-tor-enrichment-pipeline-design.md`) explicitly scoped fairness
scoring out as a non-goal, noting it as a future extension: "consumes `budget` vs
`referencePrice` + `aiSummary`; a new enrichment stage or job type."

This spec designs that stage.

**Defamation constraint (from `CLAUDE.md`):** fairness flags must read as neutral
review signals for a human to judge, never as accusations of wrongdoing. This
governs the prompt design below and is the single hardest constraint in this
feature — get the wording wrong and the product could defame a government agency.

## Goals

- Detect three categories of fairness signal per enriched TOR:
  1. **Budget** — the stated budget is a stark outlier vs. the reference price
     (ราคากลาง) in either direction.
  2. **Deadline** — the gap between announcement and submission deadline is
     unusually short for the apparent scope of work.
  3. **Qualification/specification narrowness** — eligibility or technical
     requirements are worded narrowly enough to plausibly match one specific
     product/brand/vendor.
- Write these as `Tor.fairnessFlags` entries with `status: "open"`, ready for a
  future Admin review UI (out of scope here — see Non-goals).
- Keep the defamation constraint enforced at the prompt level: every flag message
  is a neutral, descriptive observation, never an accusation.

## Non-goals (this phase)

- **Admin review/dismiss endpoint.** No `PATCH` to change `status` from `"open"`
  to `"acknowledged"`/`"dismissed"` is built here. This is intentionally deferred;
  see "Known future concern" below for the interaction this creates.
- **Deterministic/rule-based thresholds.** Budget and deadline outliers are judged
  by Gemini holistically alongside the specification-narrowness signal, not by
  hand-coded percentage/day thresholds. This was a deliberate choice: rigid
  thresholds risk false positives on cases that are contextually normal (e.g. a
  competitive-bid budget legitimately below the reference price).
- **A new job, queue, or `IngestionRun` phase.** This rides entirely inside the
  Gemini call `drainEnrichmentQueue` already makes per TOR.
- **Frontend/admin UI.** The frontend still runs on mock data; this spec is
  backend-only, matching the rest of the enrichment pipeline's phasing.

## Architecture

No new stage, job, or queue. The existing single Gemini call per TOR (made by
`GeminiExtractor.extract`, invoked from `drainEnrichmentQueue`) is extended to also
return fairness signals, using data it already has: the known `budget`/
`referencePrice`/`agency`/`title` metadata, the PDF content it already reads for
classification and summarization, and one new metadata field — `announcementDate`
— needed to judge deadline shortness (the submission deadline itself is already
extracted from the PDF as `submissionDeadline`; the announcement date was not
previously passed to the model at all).

Cost impact: marginal additional output tokens per existing call. No additional
Gemini calls, no additional retries beyond what already exists.

## Data flow / schema changes

### 1. `torExtractor.ts` — extend the extraction result schema

```ts
export const fairnessSignalSchema = z.object({
  field: z.enum(["budget", "deadline", "qualificationRequirements", "other"]),
  severity: z.enum(["low", "medium", "high"]),
  message: z.string().min(1),
});

// added to torExtractionResultSchema:
fairnessSignals: z.preprocess((v) => (v == null ? [] : v), z.array(fairnessSignalSchema)),
```

`field` reuses the existing `FairnessField` union already defined on `Tor.ts`
(`"budget" | "deadline" | "category" | "agency" | "title" |
"qualificationRequirements" | "other"`) — narrowed here to the four values this
feature actually produces. No changes to `FairnessField` itself.

### 2. `applyExtractionToTor` — map into `Tor.fairnessFlags`

In the existing `isSoftwareRelated === true` branch (same branch that writes
`aiSummary`/`category`), add:

```ts
tor.fairnessFlags = result.fairnessSignals.map((s) => ({
  field: s.field,
  severity: s.severity,
  message: s.message,
  detectedAt: now,
  status: "open",
}));
```

This **replaces the whole array** on every enrichment run — consistent with how
`aiSummary`/`classification`/`category` already behave when a TOR is re-enriched
after a content-hash change. If `isSoftwareRelated === false`, the existing early
return means `fairnessFlags` is never touched (stays whatever it was, i.e. absent
on a fresh TOR).

### 3. `geminiExtractor.ts` — prompt, schema, and input changes

- `ExtractInput.meta` gains `announcementDate?: string` (ISO date).
- `buildPrompt` includes it: `` `Known announcement date: ${m.announcementDate ?? "(unknown)"}` ``.
- `RESPONSE_SCHEMA` gains a `fairnessSignals` array property mirroring the zod
  shape above (`Type.ARRAY` of `Type.OBJECT` with `field`/`severity`/`message`,
  using the SDK's `Type` enum — per the lesson learned in the earlier
  lowercase-JSON-schema-type production bug).
- `SYSTEM_INSTRUCTION` gains the fairness-assessment paragraph (see "Prompt
  design" below).

### 4. `drainEnrichmentQueue.ts` — pass the new metadata field

The call site that builds the `extract()` input gains
`announcementDate: tor.announcementDate?.toISOString()`.

## Prompt design (neutral wording + severity)

Appended to `SYSTEM_INSTRUCTION`:

```
Additionally, assess fairness signals — patterns that may warrant human review, not
findings of wrongdoing:
- "budget": the stated budget is a stark outlier vs the reference price (ราคากลาง),
  in either direction, beyond what normal competitive-bidding variance would explain.
- "deadline": the gap between the announcement date and the submission deadline is
  unusually short for the apparent scope of work, giving few vendors time to respond.
- "qualificationRequirements": eligibility or spec requirements are worded narrowly
  enough that they plausibly match one specific product/brand/vendor rather than
  describing the needed capability generically.
Only report a signal when the document itself supports it — do not guess, and do not
flag ordinary variance. Most TORs should produce an empty fairnessSignals array; this
is expected, not a failure to find something.

Every "message" MUST be a neutral, descriptive observation for a human reviewer —
never an accusation, and never words implying intent, corruption, or wrongdoing
(avoid: "corrupt", "rigged", "collusion", "fraud", "designed to favor"). State only
what is observed and let a human judge it, e.g. "งบประมาณต่างจากราคากลางอย่างมีนัยสำคัญ
(สูงกว่า ~35%)" not "งบประมาณถูกตั้งสูงเกินจริงเพื่อเอื้อประโยชน์".

"severity": "high" only for a stark, unambiguous outlier; "medium" for a clear but
less extreme case; "low" for something marginal that a reviewer may want to glance at.
```

Rationale:
- Opens by framing flags as review signals, not conclusions — sets the tone before
  any category-specific instruction.
- Gives explicit banned words rather than only an abstract "be neutral" — LLMs
  follow negative examples more reliably than abstract tone instructions.
- Explicitly states the empty-array case is the expected common case, to counter
  the model's tendency to always find *something* to report.
- `severity` stays qualitative (no numeric thresholds), per the decision to let
  Gemini judge holistically rather than hand-coding percentage/day cutoffs.
- Messages are Thai, consistent with the existing Thai-language requirement for
  `summary`/`keyPoints`/`qualifications` added in the prior bug-fix round.

## Edge cases

- **No PDF available** (metadata-only extraction, or oversized PDF skipped): the
  `qualificationRequirements` signal naturally comes back empty since the prompt
  requires document support — no special-case code needed. Budget/deadline
  signals can still be assessed from metadata alone.
- **Re-enrichment overwrites `fairnessFlags`.** Not a problem in this phase since
  `status` never becomes anything but `"open"` (no admin endpoint exists to change
  it yet). **Known future concern:** once an admin review/dismiss endpoint exists,
  a naive full-array overwrite on re-enrichment will silently discard an admin's
  `"dismissed"`/`"acknowledged"` status. That future work must reconcile
  (e.g. merge by `field`+`message` instead of replacing wholesale) — flagging here
  so it isn't forgotten, not solving it now (YAGNI: no consumer of `status` exists
  yet).
- **Malformed severity/field enum value from Gemini:** zod rejects the whole
  object, which — per the existing `drainEnrichmentQueue` retry logic — becomes a
  transient failure and retries. This is the same failure mode already handled for
  `confidence`; no new handling needed, but it's the reason the prompt spells out
  the exact enum values rather than describing them loosely.

## Testing

- `torExtractor.test.ts`: extend the `applyExtractionToTor` "writes all fields"
  test with a `fairnessSignals` entry in the fixture and assert it lands in
  `tor.fairnessFlags` with `status: "open"` and a `detectedAt`.
- `geminiExtractor.test.ts`: extend the `RESPONSE_SCHEMA` shape test to also check
  `fairnessSignals` (same pattern as the existing `evaluationCriteria` shape
  check).
- No new test files — both are extensions of existing test suites.

## Observability

Add one log line in `drainEnrichmentQueue` whenever a TOR's `fairnessSignals` is
non-empty:

```json
{"component":"drainEnrichmentQueue","event":"fairness-flags","torId":"...","count":2}
```

This is a plain `console.log`, not a new `IngestionRun.stats` counter — grepable
for now; promote to a stats counter later if a real need for run-level aggregates
shows up (YAGNI).

## Summary of files touched

| File | Change |
|---|---|
| `backend/src/ingestion/enrichment/torExtractor.ts` | new `fairnessSignalSchema`, extend `torExtractionResultSchema`, extend `applyExtractionToTor` |
| `backend/src/ingestion/enrichment/geminiExtractor.ts` | extend `RESPONSE_SCHEMA`, `SYSTEM_INSTRUCTION`, `ExtractInput.meta`, `buildPrompt` |
| `backend/src/ingestion/enrichment/drainEnrichmentQueue.ts` | pass `announcementDate` into `extract()`; add the fairness-flags log line |
| `backend/src/ingestion/enrichment/__tests__/torExtractor.test.ts` | extend existing test |
| `backend/src/ingestion/enrichment/__tests__/geminiExtractor.test.ts` | extend existing test |

No changes to `backend/src/models/Tor.ts` — `fairnessFlags`/`FairnessField` already
support everything this feature needs.
