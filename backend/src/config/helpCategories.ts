/**
 * Help-center FAQ categories ("คู่มือช่วยเหลือ"). The slug is stored on each FAQ;
 * the label is what the help center shows. The API serves this list, so the
 * frontend never keeps its own copy. Order here is the sidebar order.
 */
export const HELP_CATEGORIES = [
  { slug: "getting-started", label: "เริ่มต้นใช้งาน" },
  { slug: "search", label: "การค้นหาและตัวกรอง TOR" },
  { slug: "tor-details", label: "รายละเอียด TOR และสถานะ" },
  { slug: "ai-summary", label: "สรุปด้วย AI และสัญญาณที่ควรตรวจสอบ" },
  { slug: "vendor-profile", label: "โปรไฟล์ธุรกิจและ TOR ที่แนะนำ" },
  { slug: "saved-tracking", label: "บันทึก ติดตามสถานะ และซ่อน TOR" },
  { slug: "account-security", label: "บัญชีและความปลอดภัย" },
  { slug: "data-reports", label: "แหล่งข้อมูลและการแจ้งข้อมูลคลาดเคลื่อน" },
] as const;

export type HelpCategorySlug = (typeof HELP_CATEGORIES)[number]["slug"];

export const HELP_CATEGORY_SLUGS = HELP_CATEGORIES.map((c) => c.slug) as [HelpCategorySlug, ...HelpCategorySlug[]];
