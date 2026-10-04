import type { TORStatus } from "@/lib/mockData";

const styles: Record<TORStatus, string> = {
  เปิดรับ: "bg-[var(--color-success-bg)] text-[var(--color-success)]",
  ใกล้ปิดรับ: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
  ปิดรับแล้ว: "bg-[var(--color-surface-alt)] text-[var(--color-text-faint)]",
  "ร่าง TOR": "bg-[var(--color-surface-alt)] text-[var(--color-ink-soft)]",
  ประกาศผู้ชนะแล้ว: "bg-[var(--color-rose-light)] text-[var(--color-rose-dark)]",
  ยกเลิก: "bg-[var(--color-danger-bg)] text-[var(--color-danger)]",
};

const dotStyles: Record<TORStatus, string> = {
  เปิดรับ: "bg-[var(--color-success)]",
  ใกล้ปิดรับ: "bg-[var(--color-warning)]",
  ปิดรับแล้ว: "bg-[var(--color-text-faint)]",
  "ร่าง TOR": "bg-[var(--color-ink-soft)]",
  ประกาศผู้ชนะแล้ว: "bg-[var(--color-rose-dark)]",
  ยกเลิก: "bg-[var(--color-danger)]",
};

export default function StatusBadge({ status }: { status: TORStatus }) {
  return (
    <span className={`badge ${styles[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotStyles[status]}`} />
      {status}
    </span>
  );
}
