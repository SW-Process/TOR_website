"use client";

import { useState } from "react";
import { Clock, ListChecks, RotateCw, Sparkles } from "lucide-react";
import AdminPageHeader from "./AdminPageHeader";
import RunStatusBadge from "./RunStatusBadge";
import { formatDateTime, formatRelativeTime } from "@/lib/adminMockData";
import {
  useIngestionRuns,
  type EnrichmentQueueInfo,
  type IngestionPhase,
  type IngestionRun,
  type LifecycleQueueInfo,
} from "@/lib/useIngestionRuns";

const PHASE_LABEL: Record<IngestionPhase, string> = {
  discovery: "ดึงข้อมูล (Ingestion)",
  enrichment: "วิเคราะห์ด้วย AI (Enrichment)",
  lifecycle: "ตรวจสถานะการจัดซื้อ (Lifecycle)",
};

const DAYS_PER_MONTH = 30;
// Mirrors ENRICHMENT_MAX_CALLS_CEILING in backend ingestionController.
const ENRICHMENT_MAX_CALLS_CEILING = 200;

const SEARCH_SUGGESTIONS = [
  "ซอฟต์แวร์",
  "ระบบสารสนเทศ",
  "เว็บไซต์",
  "แอปพลิเคชัน",
  "คลาวด์",
  "กล้องวงจรปิด",
  "บำรุงรักษาระบบ",
  "ระบบเครือข่าย",
];

/** "X / N" with a progress bar and a one-line breakdown, shared by the batch phases. */
function RunProgress({
  label,
  done,
  total,
  detail,
}: {
  label: string;
  done: number;
  total: number;
  detail: string;
}) {
  const percent = Math.min(100, Math.round((done / total) * 100));
  return (
    <div className="mt-4" aria-live="polite">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--color-text-faint)]">{label}</span>
        <span className="font-medium text-[var(--color-text)]">
          {done} / {total} รายการ
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]"
      >
        <div
          className="h-full rounded-full bg-[var(--color-ink)] transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-[var(--color-text-faint)]">{detail}</p>
    </div>
  );
}

/** Before a run: how many TORs it will analyse. During a run: "X / N" with a progress bar. */
function EnrichmentStatus({
  pending,
  queue,
  maxCalls,
  run,
}: {
  pending: boolean;
  queue: EnrichmentQueueInfo | null;
  maxCalls: number | null;
  run: IngestionRun | null;
}) {
  if (pending) {
    const planned = run?.stats.enrichmentPlanned ?? 0;
    // The run row appears with the first claimed job; until then there is nothing to count.
    if (!run || planned === 0) {
      return (
        <p className="mt-4 text-xs text-[var(--color-text-muted)]">กำลังเตรียมคิววิเคราะห์...</p>
      );
    }
    const { torsFound: done, enrichedOk, enrichedRejected, enrichedFailed, enrichmentRetried } =
      run.stats;
    return (
      <RunProgress
        label="กำลังวิเคราะห์"
        done={done}
        total={planned}
        detail={`สำเร็จ ${enrichedOk} · ไม่เกี่ยวกับซอฟต์แวร์ ${enrichedRejected} · ล้มเหลว ${enrichedFailed}${
          enrichmentRetried > 0 ? ` · รอลองใหม่ ${enrichmentRetried}` : ""
        }`}
      />
    );
  }

  if (!queue) return null;
  const willProcess = Math.min(queue.runnable, maxCalls ?? queue.maxCalls);
  if (queue.runnable === 0) {
    return (
      <p className="mt-4 text-xs text-[var(--color-text-faint)]">ไม่มี TOR ที่รอวิเคราะห์</p>
    );
  }
  return (
    <p className="mt-4 text-xs text-[var(--color-text-muted)]">
      พร้อมวิเคราะห์ <span className="font-semibold text-[var(--color-text)]">{willProcess}</span>{" "}
      รายการ
      {queue.runnable > willProcess && ` (จากที่รอทั้งหมด ${queue.runnable})`}
    </p>
  );
}

/** Before a run: how many TORs it will check. During a run: "X / N" with a progress bar. */
function LifecycleStatus({
  pending,
  queue,
  run,
}: {
  pending: boolean;
  queue: LifecycleQueueInfo | null;
  run: IngestionRun | null;
}) {
  if (pending) {
    const total = run?.stats.torsFound ?? 0;
    // The run row appears once the batch is selected; until then there is nothing to count.
    if (!run || total === 0) {
      return (
        <p className="mt-4 text-xs text-[var(--color-text-muted)]">กำลังเตรียมรายการที่จะตรวจ...</p>
      );
    }
    const { torsUpdated, torsUnchanged, torsSkipped, torsFailed } = run.stats;
    return (
      <RunProgress
        label="กำลังตรวจสถานะ"
        done={torsUpdated + torsUnchanged + torsSkipped + torsFailed}
        total={total}
        detail={`เปลี่ยนสถานะ ${torsUpdated} · ไม่เปลี่ยน ${torsUnchanged} · ข้าม ${torsSkipped} · ล้มเหลว ${torsFailed}`}
      />
    );
  }

  if (!queue) return null;
  if (queue.candidates === 0) {
    return (
      <p className="mt-4 text-xs text-[var(--color-text-faint)]">ไม่มี TOR ที่ต้องตรวจสถานะ</p>
    );
  }
  return (
    <p className="mt-4 text-xs text-[var(--color-text-muted)]">
      พร้อมตรวจ <span className="font-semibold text-[var(--color-text)]">{queue.willCheck}</span>{" "}
      รายการ
      {queue.candidates > queue.willCheck && ` (จากทั้งหมด ${queue.candidates})`}
    </p>
  );
}

export default function ScraperHealth() {
  const {
    runs,
    ready: runsReady,
    forbidden,
    error: runsError,
    ingestionPending,
    enrichmentPending,
    enrichmentQueue,
    lifecyclePending,
    lifecycleQueue,
    triggerIngestion,
    triggerEnrichment,
    triggerLifecycle,
    lastRunFor,
  } = useIngestionRuns();

  const [searchText, setSearchText] = useState("");
  const [maxProjects, setMaxProjects] = useState(50);
  const [lookbackMonths, setLookbackMonths] = useState(1);
  const [announceAllTypes, setAnnounceAllTypes] = useState(false);
  const lookbackDays = lookbackMonths * DAYS_PER_MONTH;
  // null = untouched, follow the backend default (MAX_AI_CALLS_PER_RUN)
  const [enrichmentMaxCalls, setEnrichmentMaxCalls] = useState<number | null>(null);
  const effectiveMaxCalls = enrichmentMaxCalls ?? enrichmentQueue?.maxCalls ?? null;

  function runIngestion() {
    triggerIngestion({
      searchText: searchText.trim() || undefined,
      maxProjects,
      lookbackDays,
      announceAllTypes,
    });
  }

  return (
    <div className="pb-12">
      <AdminPageHeader
        eyebrow="Data Monitoring"
        title="สถานะสแครปเปอร์"
        description="สั่งดึงข้อมูลและวิเคราะห์ TOR ด้วย AI พร้อมดูประวัติการรันของ pipeline"
      />

      <div className="mt-7 px-5 sm:px-8">
        {forbidden && (
          <p className="mt-3 text-xs text-[var(--color-danger)]">
            บัญชีนี้ไม่มีสิทธิ์สั่งรัน pipeline — ต้องเป็นผู้ดูแลระบบ (admin)
          </p>
        )}
        {runsError && <p className="mt-3 text-xs text-[var(--color-danger)]">{runsError}</p>}

        <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(
            [
              {
                phase: "discovery" as const,
                pending: ingestionPending,
                onTrigger: runIngestion,
              },
              {
                phase: "enrichment" as const,
                pending: enrichmentPending,
                onTrigger: () =>
                  triggerEnrichment(
                    enrichmentMaxCalls === null ? undefined : { maxCalls: enrichmentMaxCalls }
                  ),
              },
              {
                phase: "lifecycle" as const,
                pending: lifecyclePending,
                onTrigger: () => triggerLifecycle(),
              },
            ]
          ).map(({ phase, pending, onTrigger }) => {
            const last = lastRunFor(phase);
            const nothingQueued =
              !pending &&
              ((phase === "enrichment" && enrichmentQueue?.runnable === 0) ||
                (phase === "lifecycle" && lifecycleQueue?.candidates === 0));
            return (
              <div key={phase} className="card p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-[family-name:var(--font-heading)] font-bold text-sm text-[var(--color-text)]">
                    {PHASE_LABEL[phase]}
                  </p>
                  {last && <RunStatusBadge status={pending ? "running" : last.status} />}
                </div>

                {last ? (
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-[var(--color-text-faint)]">รันล่าสุด</p>
                      <p className="mt-0.5 font-medium text-[var(--color-text)]">
                        {formatRelativeTime(last.startedAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[var(--color-text-faint)]">ทริกเกอร์</p>
                      <p className="mt-0.5 font-medium text-[var(--color-text)]">
                        {last.trigger === "manual" ? "สั่งรันเอง" : "ตามตารางเวลา"}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[var(--color-text-faint)]">ผลลัพธ์</p>
                      <p className="mt-0.5 font-medium text-[var(--color-text)] leading-relaxed">
                        {last.outcomeSummary ?? "—"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-[var(--color-text-faint)]">
                    {runsReady ? "ยังไม่เคยรันเฟสนี้" : "กำลังโหลด..."}
                  </p>
                )}

                {phase === "discovery" && (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder="คำค้นหา (default: ซอฟต์แวร์)"
                      maxLength={200}
                      disabled={pending}
                      className="col-span-2 rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] disabled:opacity-60"
                    />
                    <div className="col-span-2 flex flex-wrap gap-1.5">
                      {SEARCH_SUGGESTIONS.map((term) => (
                        <button
                          key={term}
                          type="button"
                          onClick={() => setSearchText(term)}
                          disabled={pending}
                          className={`btn-pill px-2.5 py-1 text-[11px] transition-colors disabled:opacity-60 ${
                            searchText === term
                              ? "border border-[var(--color-ink)] text-[var(--color-text)]"
                              : "border border-[var(--color-border)] text-[var(--color-text-faint)] hover:border-[var(--color-ink)]/30"
                          }`}
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center justify-between text-xs text-[var(--color-text-faint)]">
                        <span>จำนวนโปรเจกต์สูงสุด</span>
                        <span className="font-medium text-[var(--color-text)]">{maxProjects}</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={500}
                        value={maxProjects}
                        onChange={(e) => setMaxProjects(Number(e.target.value))}
                        disabled={pending}
                        className="mt-1 w-full accent-[var(--color-ink)] disabled:opacity-60"
                      />
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center justify-between text-xs text-[var(--color-text-faint)]">
                        <span>ย้อนหลัง</span>
                        <span className="font-medium text-[var(--color-text)]">
                          {lookbackMonths} เดือน ({lookbackDays} วัน)
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={200}
                        value={lookbackMonths}
                        onChange={(e) => setLookbackMonths(Number(e.target.value))}
                        disabled={pending}
                        className="mt-1 w-full accent-[var(--color-ink)] disabled:opacity-60"
                      />
                    </div>
                    <label className="col-span-2 flex items-center gap-2 text-xs text-[var(--color-text-faint)]">
                      <input
                        type="checkbox"
                        checked={announceAllTypes}
                        onChange={(e) => setAnnounceAllTypes(e.target.checked)}
                        disabled={pending}
                      />
                      ดึงทุกประเภทประกาศ (ไม่ใช่แค่ TOR)
                    </label>
                  </div>
                )}

                {phase === "enrichment" && (
                  <>
                    {effectiveMaxCalls !== null && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs text-[var(--color-text-faint)]">
                          <span>วิเคราะห์สูงสุดต่อรอบ</span>
                          <span className="font-medium text-[var(--color-text)]">
                            {effectiveMaxCalls}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={Math.max(ENRICHMENT_MAX_CALLS_CEILING, effectiveMaxCalls)}
                          value={effectiveMaxCalls}
                          onChange={(e) => setEnrichmentMaxCalls(Number(e.target.value))}
                          disabled={pending}
                          className="mt-1 w-full accent-[var(--color-ink)] disabled:opacity-60"
                        />
                      </div>
                    )}
                    <EnrichmentStatus
                      pending={pending}
                      queue={enrichmentQueue}
                      maxCalls={effectiveMaxCalls}
                      run={last?.status === "running" ? last : null}
                    />
                  </>
                )}

                {phase === "lifecycle" && (
                  <LifecycleStatus
                    pending={pending}
                    queue={lifecycleQueue}
                    run={last?.status === "running" ? last : null}
                  />
                )}

                <button
                  type="button"
                  onClick={onTrigger}
                  disabled={pending || forbidden || nothingQueued}
                  className="btn-pill mt-4 w-full border border-[var(--color-border)] py-2 text-xs font-semibold text-[var(--color-text)] hover:border-[var(--color-ink)]/30 transition-colors disabled:opacity-60"
                >
                  {phase === "enrichment" ? (
                    <Sparkles size={13} className={pending ? "animate-pulse" : ""} />
                  ) : phase === "lifecycle" ? (
                    <ListChecks size={13} className={pending ? "animate-pulse" : ""} />
                  ) : (
                    <RotateCw size={13} className={pending ? "animate-spin" : ""} />
                  )}
                  {pending ? "กำลังรัน..." : "รันตอนนี้"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-8 px-5 sm:px-8">
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-5 py-4">
            <Clock size={16} className="text-[var(--color-text-faint)]" />
            <h2 className="font-[family-name:var(--font-heading)] font-bold text-sm text-[var(--color-text)]">
              ประวัติการรัน ({runs.length})
            </h2>
          </div>
          {runs.length === 0 ? (
            <p className="px-5 py-6 text-sm text-[var(--color-text-muted)]">
              {runsReady ? "ยังไม่มีประวัติการรัน" : "กำลังโหลด..."}
            </p>
          ) : (
            <div className="divide-y divide-[var(--color-border)] max-h-[400px] overflow-y-auto">
              {runs.map((run) => (
                <div key={run._id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--color-text)]">
                        {PHASE_LABEL[run.phase]}
                      </p>
                      <RunStatusBadge status={run.status} />
                    </div>
                    <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-faint)]">
                      <Clock size={12} />
                      {formatDateTime(run.startedAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--color-text-muted)] leading-relaxed">
                    {run.outcomeSummary ?? (run.status === "running" ? "กำลังทำงาน..." : "—")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
