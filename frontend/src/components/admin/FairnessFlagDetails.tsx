"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, Loader2 } from "lucide-react";
import ConfidenceBadge from "@/components/ConfidenceBadge";
import { apiFetch } from "@/lib/api";
import type { ConfidenceLevel } from "@/lib/mockData";
import { toConfidenceLevel } from "@/lib/torApi";

type FlagField = "budget" | "deadline" | "category" | "agency" | "title" | "qualificationRequirements" | "other";
type FlagStatus = "open" | "acknowledged" | "dismissed";

const FIELD_LABELS: Record<FlagField, string> = {
  budget: "งบประมาณ",
  deadline: "กำหนดเวลา",
  category: "หมวดหมู่",
  agency: "หน่วยงาน",
  title: "ชื่อโครงการ",
  qualificationRequirements: "คุณสมบัติผู้เสนอราคา",
  other: "อื่นๆ",
};

const SEVERITY_LABELS: Record<string, string> = {
  low: "ควรสังเกตเล็กน้อย",
  medium: "ควรพิจารณาเพิ่มเติม",
  high: "ควรตรวจสอบเพิ่มเติม",
};

const STATUS_LABELS: Record<FlagStatus, string> = {
  open: "รอตรวจสอบ",
  acknowledged: "ตรวจสอบแล้ว",
  dismissed: "ไม่ดำเนินการ",
};

interface ApiFlag {
  _id: string;
  field: FlagField;
  severity: string;
  message: string;
  status: FlagStatus;
  detectedAt?: string;
  confidence: string | null;
  reasoning: string | null;
  dataPoints: { label: string; value: string; source: "system" | "ai" }[];
}

interface Flag {
  id: string;
  field: FlagField;
  severity: string;
  message: string;
  status: FlagStatus;
  detectedAt: string | null;
  confidence: ConfidenceLevel | null;
  reasoning: string | null;
  dataPoints: ApiFlag["dataPoints"];
}

type State = { torId: string; flags?: Flag[]; error?: true };

/**
 * Admin-only detail behind each fairness flag (FR-19): the AI's reasoning and the data
 * points it rests on, from GET /api/admin/tors/:id/fairness-flags. Wording stays that of
 * a review signal, never a finding (CLAUDE.md defamation constraint).
 */
export default function FairnessFlagDetails({ torId }: { torId: string }) {
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/admin/tors/${torId}/fairness-flags`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { flags: ApiFlag[] };
        const flags: Flag[] = body.flags.map((f) => ({
          id: f._id,
          field: f.field,
          severity: f.severity,
          message: f.message,
          status: f.status,
          detectedAt: f.detectedAt ?? null,
          confidence: toConfidenceLevel(f.confidence),
          reasoning: f.reasoning,
          dataPoints: f.dataPoints ?? [],
        }));
        if (!cancelled) setState({ torId, flags });
      })
      .catch(() => {
        if (!cancelled) setState({ torId, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [torId]);

  const current = state?.torId === torId ? state : null;

  if (!current) {
    return (
      <p className="mt-4 flex items-center gap-2 text-xs text-[var(--color-text-muted)]" role="status">
        <Loader2 size={13} className="animate-spin" />
        กำลังโหลดรายละเอียดสัญญาณ...
      </p>
    );
  }
  if (current.error) {
    return (
      <p role="alert" className="mt-4 text-xs text-[var(--color-danger)]">
        โหลดรายละเอียดสัญญาณไม่สำเร็จ
      </p>
    );
  }
  if (!current.flags?.length) return null;

  return (
    <section className="mt-4 rounded-2xl bg-[var(--color-danger-bg)] p-4" aria-label="รายละเอียดสัญญาณที่ควรตรวจสอบ">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-danger)]">
        <AlertTriangle size={13} />
        สัญญาณที่ควรตรวจสอบ (สร้างโดย AI)
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
        เป็นข้อสังเกตเพื่อให้ผู้ตรวจสอบพิจารณาต่อ ไม่ใช่ข้อสรุปว่ามีการกระทำผิด
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {current.flags.map((f) => (
          <li key={f.id} className="rounded-xl bg-white/70 p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-[var(--color-text)]">{FIELD_LABELS[f.field] ?? f.field}</span>
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {SEVERITY_LABELS[f.severity] ?? f.severity} · {STATUS_LABELS[f.status]}
              </span>
              <ConfidenceBadge level={f.confidence} subject="สัญญาณนี้" size="sm" />
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-text)]">{f.message}</p>

            <details className="group mt-2">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] font-semibold text-[var(--color-ink-soft)]">
                <ChevronDown size={13} className="transition-transform group-open:rotate-180" />
                เหตุผลและข้อมูลที่ใช้
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                {f.reasoning ? (
                  <div>
                    <p className="text-[11px] font-semibold text-[var(--color-text)]">เหตุผลของ AI</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-muted)]">{f.reasoning}</p>
                  </div>
                ) : null}
                {f.dataPoints.length > 0 ? (
                  <div>
                    <p className="text-[11px] font-semibold text-[var(--color-text)]">ข้อมูลที่ใช้ประกอบ</p>
                    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                      {f.dataPoints.map((p, i) => (
                        <div key={i} className="contents">
                          <dt className="text-[var(--color-text-muted)]">{p.label}</dt>
                          <dd className="text-[var(--color-text)]">
                            {p.value}
                            <span className="ml-1.5 text-[10px] text-[var(--color-text-faint)]">
                              {p.source === "system" ? "ข้อมูลระบบ" : "AI อ่านจากเอกสาร"}
                            </span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}
                {!f.reasoning && f.dataPoints.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-muted)]">
                    สัญญาณนี้สร้างก่อนระบบเริ่มบันทึกเหตุผล จะมีรายละเอียดเมื่อ TOR ถูกประมวลผลใหม่
                  </p>
                ) : null}
                {f.detectedAt ? (
                  <p className="text-[10px] text-[var(--color-text-faint)]">
                    ตรวจพบเมื่อ {new Date(f.detectedAt).toLocaleDateString("th-TH", { dateStyle: "long", timeZone: "Asia/Bangkok" })}
                  </p>
                ) : null}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
