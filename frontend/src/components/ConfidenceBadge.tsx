import type { ConfidenceLevel } from "@/lib/mockData";

const STYLES: Record<ConfidenceLevel, { bars: number; className: string }> = {
  สูง: { bars: 3, className: "bg-[var(--color-success-bg)] text-[var(--color-success)]" },
  ปานกลาง: { bars: 2, className: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]" },
  ต่ำ: { bars: 1, className: "bg-[var(--color-danger-bg)] text-[var(--color-danger)]" },
};

const UNKNOWN_CLASS = "bg-[var(--color-surface-alt)] text-[var(--color-text-muted)]";

/**
 * How confident the AI is in a summary or a fairness signal (FR-20). Three bars plus the
 * word, so the level doesn't rest on colour alone. `null` (the AI gave none, e.g. content
 * generated before confidence was recorded) shows as unassessed rather than a guess.
 */
export default function ConfidenceBadge({
  level,
  subject,
  size = "md",
}: {
  level: ConfidenceLevel | null;
  /** What the confidence is about, for the tooltip: "สรุปนี้", "สัญญาณนี้". */
  subject: string;
  size?: "sm" | "md";
}) {
  const style = level ? STYLES[level] : null;
  const label = level ? `ความเชื่อมั่น${level}` : "ไม่ระบุความเชื่อมั่น";
  const title = level
    ? `AI มีความเชื่อมั่นระดับ${level}ว่า${subject}ถูกต้องตามเอกสารต้นฉบับ`
    : `AI ไม่ได้ระบุระดับความเชื่อมั่นของ${subject}`;
  const text = size === "sm" ? "text-[10px] px-2 py-0.5 gap-1" : "text-xs px-2.5 py-1 gap-1.5";

  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center rounded-full font-medium ${text} ${style?.className ?? UNKNOWN_CLASS}`}
    >
      <span aria-hidden="true" className="flex items-end gap-[2px]">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={`w-[3px] rounded-sm bg-current ${i <= (style?.bars ?? 0) ? "" : "opacity-25"}`}
            style={{ height: `${3 + i * 2}px` }}
          />
        ))}
      </span>
      {label}
    </span>
  );
}
