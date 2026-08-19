import TORStatsChart from "./TORStatsChart";
import TORPreviewTable from "./TORPreviewTable";
import StatusDonut from "./StatusDonut";
import TodaySummary from "./TodaySummary";
import { adminUser } from "@/lib/adminMockData";

export default function DashboardOverview() {
  return (
    <div className="pb-4">
      <div className="px-5 sm:px-8 pt-2">
        <h1 className="font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-extrabold text-[var(--color-text)]">
          สวัสดี, {adminUser.name}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">นี่คือสรุปสถานะระบบดึงข้อมูล TOR ของวันนี้</p>
      </div>

      <div className="mt-6 px-5 sm:px-8 grid lg:grid-cols-[300px_minmax(0,1fr)] gap-5 items-stretch">
        <TodaySummary />

        <div className="min-w-0">
          <TORStatsChart />
        </div>
      </div>

      <div className="mt-5 px-5 sm:px-8 grid lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-stretch">
        <div className="min-w-0">
          <TORPreviewTable />
        </div>
        <StatusDonut />
      </div>
    </div>
  );
}
