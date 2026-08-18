import { Activity, AlertTriangle, Database, FileText } from "lucide-react";
import { dataSources, scraperRuns, torFlags } from "@/lib/adminMockData";

export default function TodaySummary() {
  const todayRuns = scraperRuns.filter((r) => r.startedAt.startsWith("2026-08-18"));
  const todayScraped = todayRuns.reduce((sum, r) => sum + r.itemsFound, 0);
  const flaggedCount = Object.values(torFlags).flat().length;
  const healthySources = dataSources.filter((s) => s.status === "success").length;
  const successRuns = scraperRuns.filter((r) => r.status === "success").length;
  const scrapeSuccessRate = Math.round((successRuns / scraperRuns.length) * 100);

  const stats = [
    {
      icon: FileText,
      label: "TOR ที่ดึงมาวันนี้",
      value: `${todayScraped} รายการ`,
      desc: "เพิ่มขึ้น 18% จากเมื่อวาน ระบบสแครปทำงานปกติดี",
      good: true,
    },
    {
      icon: AlertTriangle,
      label: "ต้องตรวจสอบ",
      value: `${flaggedCount} รายการ`,
      desc: "ลดลง 25% จากเมื่อวาน ควรตรวจสอบก่อนเผยแพร่ให้ผู้ใช้เห็น",
      good: false,
    },
    {
      icon: Activity,
      label: "แหล่งข้อมูลปกติ",
      value: `${healthySources}/${dataSources.length}`,
      desc: `${dataSources.length - healthySources} แหล่งล้มเหลวในรอบล่าสุด`,
      good: false,
    },
    {
      icon: Database,
      label: "อัตราความสำเร็จ",
      value: `${scrapeSuccessRate}%`,
      desc: "อัตราความสำเร็จของการสแครปเพิ่มขึ้น 5%",
      good: true,
    },
  ];

  return (
    <div className="card p-5 sm:p-6 flex flex-col h-full">
      <h2 className="font-[family-name:var(--font-heading)] font-bold text-base text-[var(--color-text)]">
        สรุปวันนี้
      </h2>
      <p className="mt-0.5 text-xs text-[var(--color-text-faint)]">ภาพรวมการทำงานของระบบวันนี้</p>

      <div className="mt-4 flex flex-1 flex-col">
        {stats.map((s) => (
          <div
            key={s.label}
            className="group flex gap-3.5 rounded-2xl px-3 py-3.5 transition-colors hover:bg-[var(--color-rose-light)]"
          >
            <div className="relative shrink-0">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[var(--color-ink-soft)] shadow-[var(--shadow-sm)] transition-colors group-hover:text-[var(--color-rose-dark)]">
                <s.icon size={22} />
              </span>
              <span
                className={`absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-white ${
                  s.good ? "bg-[var(--color-success)]" : "bg-[var(--color-warning)]"
                }`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13px] font-bold text-[var(--color-text)]">{s.label}</span>
                <span className="text-sm font-extrabold text-[var(--color-text)]">{s.value}</span>
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-muted)]">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
