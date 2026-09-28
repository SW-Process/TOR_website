"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { apiFetch } from "@/lib/api";

export default function ReportIssueButton({
  torId,
  projectCode,
}: {
  /** Mongo `_id` of the TOR — used to address the report at the backend. */
  torId: string;
  /** Human-readable project code shown to the reporter for confirmation. */
  projectCode: string;
}) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/tors/${torId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: detail }),
      });
      if (!res.ok) throw new Error();
      setSent(true);
    } catch {
      setError("ส่งเรื่องแจ้งไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn-pill w-full border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--color-text-muted)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] transition-colors"
      >
        <AlertTriangle size={16} />
        แจ้งข้อมูลคลาดเคลื่อน
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h3 className="font-[family-name:var(--font-heading)] font-semibold text-[var(--color-text)]">
                แจ้งข้อมูลคลาดเคลื่อนของ TOR
              </h3>
              <button onClick={() => setOpen(false)} aria-label="ปิด">
                <X size={18} className="text-[var(--color-text-muted)]" />
              </button>
            </div>

            {sent ? (
              <div className="mt-5 flex items-center gap-2 rounded-md bg-[var(--color-success-bg)] px-4 py-3 text-sm text-[var(--color-success)]">
                <CheckCircle2 size={18} />
                ได้รับแจ้งเรื่องเรียบร้อย ทีมงานจะตรวจสอบและติดต่อกลับ
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
                <p className="text-xs text-[var(--color-text-muted)]">
                  อ้างอิงโครงการ: {projectCode} — โปรดระบุจุดที่พบว่าข้อมูลไม่ตรงกับเอกสารต้นฉบับ เช่น
                  งบประมาณ วันปิดรับ หรือคุณสมบัติผู้ยื่นข้อเสนอ
                </p>
                <textarea
                  required
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  rows={4}
                  placeholder="รายละเอียดข้อผิดพลาดที่พบ..."
                  className="w-full rounded-2xl border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--color-ink)]"
                />
                {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-pill btn-pill-primary py-2.5 text-sm disabled:opacity-60"
                >
                  {submitting ? "กำลังส่ง..." : "ส่งเรื่องแจ้ง"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
