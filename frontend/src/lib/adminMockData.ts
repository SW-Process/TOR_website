export type RunStatus = "success" | "failed" | "running";

export interface DataSource {
  id: string;
  name: string;
  url: string;
  status: RunStatus;
  lastRunAt: string;
  nextRunAt: string;
  itemsScraped: number;
  durationSec: number;
}

export const dataSources: DataSource[] = [
  {
    id: "src-bangkok-opendata",
    name: "Bangkok Open Data (TOR/PR)",
    url: "data.bangkok.go.th/dataset/torpr",
    status: "success",
    lastRunAt: "2026-08-18T06:00:00+07:00",
    nextRunAt: "2026-08-19T06:00:00+07:00",
    itemsScraped: 21,
    durationSec: 65,
  },
  {
    id: "src-dbd",
    name: "กรมพัฒนาธุรกิจการค้า (DBD)",
    url: "dbd.go.th/procure",
    status: "success",
    lastRunAt: "2026-08-18T06:04:00+07:00",
    nextRunAt: "2026-08-19T06:04:00+07:00",
    itemsScraped: 12,
    durationSec: 44,
  },
  {
    id: "src-mol",
    name: "กระทรวงแรงงาน (MOL)",
    url: "mol.go.th/procurement_categories",
    status: "running",
    lastRunAt: "2026-08-18T06:00:00+07:00",
    nextRunAt: "2026-08-19T06:00:00+07:00",
    itemsScraped: 4,
    durationSec: 0,
  },
  {
    id: "src-egp2-bangkok",
    name: "e-GP กรุงเทพมหานคร",
    url: "egp2.bangkok.go.th",
    status: "failed",
    lastRunAt: "2026-08-18T06:02:00+07:00",
    nextRunAt: "2026-08-19T06:02:00+07:00",
    itemsScraped: 0,
    durationSec: 6,
  },
  {
    id: "src-opencontract",
    name: "Bangkok Open Contract",
    url: "opencontract.bangkok.go.th",
    status: "success",
    lastRunAt: "2026-08-18T06:05:00+07:00",
    nextRunAt: "2026-08-19T06:05:00+07:00",
    itemsScraped: 9,
    durationSec: 28,
  },
];

export interface ScraperRun {
  id: string;
  sourceId: string;
  sourceName: string;
  startedAt: string;
  status: RunStatus;
  itemsFound: number;
  itemsFlagged: number;
  durationSec: number;
  errorMessage?: string;
}

export const scraperRuns: ScraperRun[] = [
  {
    id: "run-1042",
    sourceId: "src-bangkok-opendata",
    sourceName: "Bangkok Open Data (TOR/PR)",
    startedAt: "2026-08-18T06:00:00+07:00",
    status: "success",
    itemsFound: 21,
    itemsFlagged: 1,
    durationSec: 65,
  },
  {
    id: "run-1041",
    sourceId: "src-egp2-bangkok",
    sourceName: "e-GP กรุงเทพมหานคร",
    startedAt: "2026-08-18T06:02:00+07:00",
    status: "failed",
    itemsFound: 0,
    itemsFlagged: 0,
    durationSec: 6,
    errorMessage: "HTTP 503 จากปลายทาง — เว็บไซต์ต้นทางล่มหรือปิดปรับปรุงชั่วคราว",
  },
  {
    id: "run-1040",
    sourceId: "src-dbd",
    sourceName: "กรมพัฒนาธุรกิจการค้า (DBD)",
    startedAt: "2026-08-18T06:04:00+07:00",
    status: "success",
    itemsFound: 12,
    itemsFlagged: 0,
    durationSec: 44,
  },
  {
    id: "run-1039",
    sourceId: "src-opencontract",
    sourceName: "Bangkok Open Contract",
    startedAt: "2026-08-18T06:05:00+07:00",
    status: "success",
    itemsFound: 9,
    itemsFlagged: 1,
    durationSec: 28,
  },
  {
    id: "run-1038",
    sourceId: "src-mol",
    sourceName: "กระทรวงแรงงาน (MOL)",
    startedAt: "2026-08-17T06:00:00+07:00",
    status: "success",
    itemsFound: 4,
    itemsFlagged: 0,
    durationSec: 33,
  },
];

export type FlaggedField = "budget" | "deadline" | "category" | "agency" | "title";

export interface FieldFlag {
  field: FlaggedField;
  reason: string;
}

export const torFlags: Record<string, FieldFlag[]> = {
  "tor-2026-0135": [
    {
      field: "budget",
      reason: "งบประมาณสูงกว่าค่าเฉลี่ยของหมวดหมู่เดียวกัน +165% ผิดปกติเมื่อเทียบกับโครงการลักษณะใกล้เคียง",
    },
  ],
  "tor-2026-0121": [
    {
      field: "deadline",
      reason: "วันที่ปิดรับที่ดึงมาอยู่ก่อนวันประกาศ คาดว่ารูปแบบวันที่ในเอกสารต้นฉบับถูกแปลงผิด",
    },
  ],
  "tor-2026-0111": [
    {
      field: "category",
      reason: "ระบบจัดหมวดหมู่อัตโนมัติให้ความเชื่อมั่นต่ำ (62%) เนื้อหาเอกสารอาจเข้าข่ายหมวดอื่น",
    },
  ],
};

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "เมื่อสักครู่";
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ชั่วโมงที่แล้ว`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay} วันที่แล้ว`;
}
