import { RunStatus } from "@/lib/adminMockData";

const labels: Record<RunStatus, string> = {
  success: "สำเร็จ",
  failed: "ล้มเหลว",
  running: "กำลังทำงาน",
};

const styles: Record<RunStatus, string> = {
  success: "bg-[var(--color-success-bg)] text-[var(--color-success)]",
  failed: "bg-[var(--color-danger-bg)] text-[var(--color-danger)]",
  running: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
};

const dotStyles: Record<RunStatus, string> = {
  success: "bg-[var(--color-success)]",
  failed: "bg-[var(--color-danger)]",
  running: "bg-[var(--color-warning)] animate-dot-pulse",
};

export default function RunStatusBadge({ status }: { status: RunStatus }) {
  return (
    <span className={`badge ${styles[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotStyles[status]}`} />
      {labels[status]}
    </span>
  );
}
