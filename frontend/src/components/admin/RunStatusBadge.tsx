import { RunStatus } from "@/lib/adminMockData";

export type ExtendedRunStatus = RunStatus | "partial";

const labels: Record<ExtendedRunStatus, string> = {
  success: "สำเร็จ",
  failed: "ล้มเหลว",
  running: "กำลังทำงาน",
  partial: "สำเร็จบางส่วน",
};

const styles: Record<ExtendedRunStatus, string> = {
  success: "bg-[var(--color-success-bg)] text-[var(--color-success)]",
  failed: "bg-[var(--color-danger-bg)] text-[var(--color-danger)]",
  running: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
  partial: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
};

const dotStyles: Record<ExtendedRunStatus, string> = {
  success: "bg-[var(--color-success)]",
  failed: "bg-[var(--color-danger)]",
  running: "bg-[var(--color-warning)] animate-dot-pulse",
  partial: "bg-[var(--color-warning)]",
};

export default function RunStatusBadge({ status }: { status: ExtendedRunStatus }) {
  return (
    <span className={`badge ${styles[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotStyles[status]}`} />
      {labels[status]}
    </span>
  );
}
