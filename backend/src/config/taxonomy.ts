export const TAXONOMY_VERSION = "2026-08-31";

export const TAXONOMY = [
  "software-development",
  "web-application",
  "mobile-application",
  "information-system",
  "data-platform-analytics",
  "gis",
  "cctv-its",
  "iot-sensor",
  "cloud-infrastructure",
  "network-datacenter",
  "cybersecurity",
  "erp-back-office",
  "hospital-information-system",
  "e-learning",
  "chatbot-line-oa",
  "software-license",
  "system-maintenance",
  "it-consulting-sa",
  "hardware-with-software",
  "other",
] as const;

export type TorCategory = (typeof TAXONOMY)[number];

const MEMBERS: ReadonlySet<string> = new Set(TAXONOMY);

export function isTaxonomyCategory(value: string): value is TorCategory {
  return MEMBERS.has(value);
}

export const GOODS_CATEGORY_FALLBACK: { pattern: RegExp; category: TorCategory }[] = [
  { pattern: /CCTV|กล้องโทรทัศน์วงจรปิด|กล้องวงจรปิด|จราจรอัจฉริยะ|ITS/i, category: "cctv-its" },
  { pattern: /บำรุงรักษาระบบ|ดูแลระบบ|maintenance|\bMA\b/i, category: "system-maintenance" },
  { pattern: /ลิขสิทธิ์|license|licence|subscription|สิทธิ์การใช้งาน/i, category: "software-license" },
  { pattern: /ที่ปรึกษา|consult|ออกแบบระบบ|วิเคราะห์ระบบ/i, category: "it-consulting-sa" },
  { pattern: /โรงพยาบาล|hospital|\bHIS\b|เวชระเบียน/i, category: "hospital-information-system" },
  { pattern: /คลาวด์|cloud|เครื่องแม่ข่าย|server|ดาต้าเซ็นเตอร์|data ?center/i, category: "cloud-infrastructure" },
  { pattern: /เครือข่าย|network|switch|router|firewall/i, category: "network-datacenter" },
  { pattern: /ปลอดภัยไซเบอร์|cyber ?security|security|มั่นคงปลอดภัย/i, category: "cybersecurity" },
  { pattern: /GIS|ภูมิสารสนเทศ|แผนที่/i, category: "gis" },
  { pattern: /mobile|แอปพลิเคชัน.*มือถือ|iOS|Android/i, category: "mobile-application" },
  { pattern: /เว็บ|website|web ?application|เว็บไซต์/i, category: "web-application" },
  { pattern: /e-?learning|บทเรียนออนไลน์|อบรมออนไลน์/i, category: "e-learning" },
  { pattern: /chatbot|line ?oa|แชทบ็อท/i, category: "chatbot-line-oa" },
  { pattern: /ระบบสารสนเทศ|สารสนเทศ|\bMIS\b/i, category: "information-system" },
  { pattern: /พัฒนาระบบ|จัดทำระบบ|พัฒนาโปรแกรม|software ?development/i, category: "software-development" },
];

export function fallbackCategory(text: string): TorCategory {
  for (const { pattern, category } of GOODS_CATEGORY_FALLBACK) {
    if (pattern.test(text)) return category;
  }
  return "other";
}
