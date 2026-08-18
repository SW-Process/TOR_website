export const adminUser = {
  name: "ผู้ดูแลระบบ",
  email: "admin@torchecker.go.th",
  notifications: 3,
};

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
    id: "src-egp",
    name: "e-GP กรมบัญชีกลาง",
    url: "process3.gprocurement.go.th",
    status: "success",
    lastRunAt: "2026-08-18T06:00:00+07:00",
    nextRunAt: "2026-08-18T18:00:00+07:00",
    itemsScraped: 63,
    durationSec: 142,
  },
  {
    id: "src-yothi",
    name: "สำนักการโยธา",
    url: "pwd.bangkok.go.th",
    status: "success",
    lastRunAt: "2026-08-18T06:04:00+07:00",
    nextRunAt: "2026-08-18T18:04:00+07:00",
    itemsScraped: 8,
    durationSec: 39,
  },
  {
    id: "src-drainage",
    name: "สำนักการระบายน้ำ",
    url: "dds.bangkok.go.th",
    status: "running",
    lastRunAt: "2026-08-17T06:00:00+07:00",
    nextRunAt: "2026-08-18T06:00:00+07:00",
    itemsScraped: 5,
    durationSec: 0,
  },
  {
    id: "src-medical",
    name: "สำนักการแพทย์",
    url: "msdbangkok.go.th",
    status: "failed",
    lastRunAt: "2026-08-18T06:02:00+07:00",
    nextRunAt: "2026-08-18T18:02:00+07:00",
    itemsScraped: 0,
    durationSec: 8,
  },
  {
    id: "src-education",
    name: "สำนักการศึกษา",
    url: "bangkokeducation.in.th",
    status: "success",
    lastRunAt: "2026-08-18T06:05:00+07:00",
    nextRunAt: "2026-08-18T18:05:00+07:00",
    itemsScraped: 3,
    durationSec: 21,
  },
  {
    id: "src-environment",
    name: "สำนักสิ่งแวดล้อม",
    url: "environmentbma.go.th",
    status: "failed",
    lastRunAt: "2026-08-18T06:03:00+07:00",
    nextRunAt: "2026-08-18T18:03:00+07:00",
    itemsScraped: 0,
    durationSec: 4,
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
    sourceId: "src-egp",
    sourceName: "e-GP กรมบัญชีกลาง",
    startedAt: "2026-08-18T06:00:00+07:00",
    status: "success",
    itemsFound: 63,
    itemsFlagged: 2,
    durationSec: 142,
  },
  {
    id: "run-1041",
    sourceId: "src-medical",
    sourceName: "สำนักการแพทย์",
    startedAt: "2026-08-18T06:02:00+07:00",
    status: "failed",
    itemsFound: 0,
    itemsFlagged: 0,
    durationSec: 8,
    errorMessage: "HTTP 503 จากปลายทาง — เว็บไซต์ต้นทางล่มหรือปิดปรับปรุงชั่วคราว",
  },
  {
    id: "run-1040",
    sourceId: "src-environment",
    sourceName: "สำนักสิ่งแวดล้อม",
    startedAt: "2026-08-18T06:03:00+07:00",
    status: "failed",
    itemsFound: 0,
    itemsFlagged: 0,
    durationSec: 4,
    errorMessage: "Timeout: ไม่ได้รับการตอบสนองภายใน 30 วินาที",
  },
  {
    id: "run-1039",
    sourceId: "src-yothi",
    sourceName: "สำนักการโยธา",
    startedAt: "2026-08-18T06:04:00+07:00",
    status: "success",
    itemsFound: 8,
    itemsFlagged: 1,
    durationSec: 39,
  },
  {
    id: "run-1038",
    sourceId: "src-education",
    sourceName: "สำนักการศึกษา",
    startedAt: "2026-08-18T06:05:00+07:00",
    status: "success",
    itemsFound: 3,
    itemsFlagged: 0,
    durationSec: 21,
  },
  {
    id: "run-1037",
    sourceId: "src-drainage",
    sourceName: "สำนักการระบายน้ำ",
    startedAt: "2026-08-17T06:00:00+07:00",
    status: "success",
    itemsFound: 5,
    itemsFlagged: 0,
    durationSec: 51,
  },
];

export type LogLevel = "info" | "warning" | "error";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
}

export const systemLogs: LogEntry[] = [
  {
    id: "log-501",
    timestamp: "2026-08-18T06:05:12+07:00",
    level: "info",
    source: "scraper.education",
    message: "ดึงประกาศสำเร็จ 3 รายการ ใช้เวลา 21 วินาที",
  },
  {
    id: "log-500",
    timestamp: "2026-08-18T06:04:58+07:00",
    level: "warning",
    source: "parser.budget",
    message: "รูปแบบงบประมาณของ tor-2026-0135 ผิดปกติ (สูงกว่าค่าเฉลี่ยหมวดหมู่ +165%) ตั้งค่าสถานะให้ตรวจสอบ",
  },
  {
    id: "log-499",
    timestamp: "2026-08-18T06:04:10+07:00",
    level: "info",
    source: "scraper.yothi",
    message: "ดึงประกาศสำเร็จ 8 รายการ ใช้เวลา 39 วินาที",
  },
  {
    id: "log-498",
    timestamp: "2026-08-18T06:03:04+07:00",
    level: "error",
    source: "scraper.environment",
    message: "Timeout: ไม่ได้รับการตอบสนองจาก environmentbma.go.th ภายใน 30 วินาที",
  },
  {
    id: "log-497",
    timestamp: "2026-08-18T06:02:31+07:00",
    level: "error",
    source: "scraper.medical",
    message: "HTTP 503 จาก msdbangkok.go.th — เว็บไซต์ต้นทางล่มหรือปิดปรับปรุงชั่วคราว",
  },
  {
    id: "log-496",
    timestamp: "2026-08-18T06:01:45+07:00",
    level: "warning",
    source: "parser.date",
    message: "วันที่ปิดรับของ tor-2026-0121 อยู่ก่อนวันประกาศ คาดว่ารูปแบบวันที่ในเอกสารต้นฉบับผิดปกติ",
  },
  {
    id: "log-495",
    timestamp: "2026-08-18T06:01:02+07:00",
    level: "warning",
    source: "classifier.category",
    message: "ความเชื่อมั่นการจัดหมวดหมู่ของ tor-2026-0111 ต่ำกว่าเกณฑ์ (62%) ตั้งค่าสถานะให้ตรวจสอบ",
  },
  {
    id: "log-494",
    timestamp: "2026-08-18T06:00:22+07:00",
    level: "info",
    source: "scraper.egp",
    message: "เริ่มดึงข้อมูลจาก e-GP กรมบัญชีกลาง — พบประกาศใหม่ 63 รายการ",
  },
  {
    id: "log-493",
    timestamp: "2026-08-17T18:00:05+07:00",
    level: "info",
    source: "scheduler",
    message: "เริ่มรอบสแครปตามกำหนดเวลา (18:00) สำหรับแหล่งข้อมูลทั้งหมด 6 แหล่ง",
  },
  {
    id: "log-492",
    timestamp: "2026-08-17T09:12:40+07:00",
    level: "error",
    source: "db.connection",
    message: "เชื่อมต่อฐานข้อมูลล้มเหลวชั่วคราว — ลองใหม่อัตโนมัติสำเร็จหลังจาก 2 ครั้ง",
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
