import type { TORStatus } from "@/lib/mockData";

const styles: Record<TORStatus, string> = {
  เปิดรับ: "bg-[var(--color-success-bg)] text-[var(--color-success)]",
  ใกล้ปิดรับ: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
  ปิดรับแล้ว: "bg-[var(--color-surface-alt)] text-[var(--color-text-faint)]",
};

const dotStyles: Record<TORStatus, string> = {
  เปิดรับ: "bg-[var(--color-success)]",
  ใกล้ปิดรับ: "bg-[var(--color-warning)]",
  ปิดรับแล้ว: "bg-[var(--color-text-faint)]",
};

export default function StatusBadge({ status }: { status: TORStatus }) {
  return (
    <span className={`badge ${styles[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotStyles[status]}`} />
      {status}
    </span>
  );
}
