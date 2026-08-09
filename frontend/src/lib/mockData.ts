export type TORStatus = "เปิดรับ" | "ใกล้ปิดรับ" | "ปิดรับแล้ว";

export type Category =
  | "งานก่อสร้าง"
  | "เทคโนโลยีสารสนเทศ"
  | "งานที่ปรึกษา"
  | "จัดซื้อครุภัณฑ์"
  | "งานบริการ"
  | "บำรุงรักษา"
  | "สาธารณสุข"
  | "สิ่งแวดล้อม";

export interface AISummary {
  keyPoints: string[];
  qualifications: string[];
  evaluationCriteria: { label: string; weight: number }[];
  generatedAt: string;
  confidence: "สูง" | "ปานกลาง" | "ต่ำ";
}

export interface TOR {
  id: string;
  title: string;
  agency: string;
  department: string;
  category: Category;
  budget: number;
  announceDate: string;
  deadline: string;
  status: TORStatus;
  projectCode: string;
  location: string;
  views: number;
  documentUrl: string;
  summary: AISummary;
  description: string;
}

export const categories: Category[] = [
  "งานก่อสร้าง",
  "เทคโนโลยีสารสนเทศ",
  "งานที่ปรึกษา",
  "จัดซื้อครุภัณฑ์",
  "งานบริการ",
  "บำรุงรักษา",
  "สาธารณสุข",
  "สิ่งแวดล้อม",
];

export const agencies: string[] = [
  "สำนักการโยธา",
  "สำนักการระบายน้ำ",
  "สำนักการแพทย์",
  "สำนักสิ่งแวดล้อม",
  "สำนักยุทธศาสตร์และประเมินผล",
  "สำนักการจราจรและขนส่ง",
  "สำนักการศึกษา",
  "สำนักงานเขตบางรัก",
];

function daysFromToday(days: number): string {
  const d = new Date("2026-08-09");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const torList: TOR[] = [
  {
    id: "tor-2026-0142",
    title: "จ้างพัฒนาระบบแพลตฟอร์มสืบค้นประกาศจัดซื้อจัดจ้างกลาง (e-Procurement Portal)",
    agency: "สำนักยุทธศาสตร์และประเมินผล",
    department: "กองสารสนเทศภูมิศาสตร์และดิจิทัล",
    category: "เทคโนโลยีสารสนเทศ",
    budget: 8500000,
    announceDate: daysFromToday(-6),
    deadline: daysFromToday(9),
    status: "เปิดรับ",
    projectCode: "กทม.-IT-2569-0142",
    location: "กรุงเทพมหานคร",
    views: 1284,
    documentUrl: "#",
    description:
      "จัดจ้างพัฒนาระบบเว็บแอปพลิเคชันสำหรับสืบค้น รวบรวม และแสดงผลประกาศจัดซื้อจัดจ้างของหน่วยงานในสังกัดกรุงเทพมหานคร เชื่อมต่อข้อมูลจากระบบ e-GP พร้อมระบบแจ้งเตือนผู้ใช้งาน",
    summary: {
      keyPoints: [
        "พัฒนาเว็บแอปพลิเคชันรองรับผู้ใช้งานพร้อมกันไม่ต่ำกว่า 5,000 ราย",
        "เชื่อมต่อ API รับข้อมูลประกาศจัดซื้อจัดจ้างจากระบบ e-GP แบบอัตโนมัติ",
        "ระยะเวลาดำเนินโครงการ 180 วัน นับถัดจากวันลงนามในสัญญา",
        "ต้องมีระบบแดชบอร์ดสำหรับผู้ดูแลระบบและระบบรายงานผลการใช้งาน",
      ],
      qualifications: [
        "เป็นนิติบุคคลที่จดทะเบียนในประเทศไทย ทุนจดทะเบียนไม่ต่ำกว่า 5 ล้านบาท",
        "มีผลงานพัฒนาระบบภาครัฐหรือระบบขนาดใหญ่ในช่วง 5 ปีที่ผ่านมาไม่น้อยกว่า 2 โครงการ",
        "มีบุคลากรที่ผ่านการรับรอง เช่น PMP หรือเทียบเท่า อย่างน้อย 1 ท่าน",
      ],
      evaluationCriteria: [
        { label: "ด้านเทคนิค", weight: 70 },
        { label: "ด้านราคา", weight: 30 },
      ],
      generatedAt: daysFromToday(-5),
      confidence: "สูง",
    },
  },
  {
    id: "tor-2026-0138",
    title: "ประกวดราคาจ้างก่อสร้างปรับปรุงผิวจราจรถนนสายรอง เขตบางรัก",
    agency: "สำนักการโยธา",
    department: "กองก่อสร้างและบูรณะ",
    category: "งานก่อสร้าง",
    budget: 24800000,
    announceDate: daysFromToday(-14),
    deadline: daysFromToday(3),
    status: "ใกล้ปิดรับ",
    projectCode: "กทม.-CON-2569-0138",
    location: "เขตบางรัก",
    views: 956,
    documentUrl: "#",
    description:
      "งานปรับปรุงผิวจราจรแอสฟัลต์คอนกรีต พร้อมระบบระบายน้ำผิวทาง ความยาวรวมประมาณ 3.2 กิโลเมตร ในพื้นที่เขตบางรัก",
    summary: {
      keyPoints: [
        "งานปรับปรุงผิวจราจรระยะทางรวม 3.2 กิโลเมตร พร้อมงานระบายน้ำ",
        "ระยะเวลาก่อสร้าง 120 วัน ต้องส่งมอบงานภายในฤดูฝนถัดไป",
        "ต้องวางแผนจัดการจราจรระหว่างก่อสร้างและรายงานความคืบหน้ารายสัปดาห์",
      ],
      qualifications: [
        "ผู้รับจ้างต้องมีผลงานก่อสร้างถนนกับหน่วยงานราชการมูลค่าไม่ต่ำกว่า 10 ล้านบาท",
        "ขึ้นทะเบียนผู้ประกอบการงานก่อสร้างประเภทชั้น 1 หรือ 2",
      ],
      evaluationCriteria: [
        { label: "ด้านราคา", weight: 100 },
      ],
      generatedAt: daysFromToday(-13),
      confidence: "สูง",
    },
  },
  {
    id: "tor-2026-0135",
    title: "จ้างที่ปรึกษาจัดทำแผนแม่บทการจัดการน้ำท่วมและระบายน้ำระยะยาว",
    agency: "สำนักการระบายน้ำ",
    department: "กองนโยบายและแผนงาน",
    category: "งานที่ปรึกษา",
    budget: 12000000,
    announceDate: daysFromToday(-20),
    deadline: daysFromToday(16),
    status: "เปิดรับ",
    projectCode: "กทม.-CSV-2569-0135",
    location: "กรุงเทพมหานคร",
    views: 641,
    documentUrl: "#",
    description:
      "จ้างที่ปรึกษาศึกษาและจัดทำแผนแม่บทบริหารจัดการน้ำท่วมและระบบระบายน้ำของกรุงเทพมหานคร ระยะเวลา 10 ปี ครอบคลุมการวิเคราะห์ความเสี่ยงและแผนลงทุน",
    summary: {
      keyPoints: [
        "จัดทำแผนแม่บทระยะ 10 ปี ครอบคลุมพื้นที่ 50 เขต",
        "ต้องมีการรับฟังความคิดเห็นประชาชนอย่างน้อย 3 ครั้ง",
        "ส่งมอบรายงานฉบับสมบูรณ์ภายใน 300 วัน",
      ],
      qualifications: [
        "หัวหน้าโครงการต้องมีวุฒิปริญญาโทขึ้นไปด้านวิศวกรรมทรัพยากรน้ำหรือสาขาที่เกี่ยวข้อง",
        "บริษัทที่ปรึกษาต้องขึ้นทะเบียนกับศูนย์ข้อมูลที่ปรึกษาไทย",
      ],
      evaluationCriteria: [
        { label: "ด้านเทคนิค", weight: 80 },
        { label: "ด้านราคา", weight: 20 },
      ],
      generatedAt: daysFromToday(-19),
      confidence: "ปานกลาง",
    },
  },
  {
    id: "tor-2026-0129",
    title: "จัดซื้อครุภัณฑ์ทางการแพทย์ เครื่องช่วยหายใจชนิดควบคุมปริมาตรและความดัน",
    agency: "สำนักการแพทย์",
    department: "โรงพยาบาลกลาง",
    category: "จัดซื้อครุภัณฑ์",
    budget: 15600000,
    announceDate: daysFromToday(-9),
    deadline: daysFromToday(7),
    status: "เปิดรับ",
    projectCode: "กทม.-MED-2569-0129",
    location: "โรงพยาบาลกลาง",
    views: 512,
    documentUrl: "#",
    description:
      "จัดซื้อเครื่องช่วยหายใจชนิดควบคุมปริมาตรและความดัน จำนวน 20 เครื่อง พร้อมอุปกรณ์ประกอบและการฝึกอบรมการใช้งานบุคลากรทางการแพทย์",
    summary: {
      keyPoints: [
        "จัดซื้อเครื่องช่วยหายใจ จำนวน 20 เครื่อง พร้อมรับประกัน 3 ปี",
        "ต้องผ่านการรับรองมาตรฐาน อย. และ CE หรือ FDA",
        "รวมค่าฝึกอบรมบุคลากรและค่าบำรุงรักษาปีแรก",
      ],
      qualifications: [
        "เป็นตัวแทนจำหน่ายที่ได้รับการแต่งตั้งจากผู้ผลิตโดยตรง",
        "มีศูนย์บริการซ่อมบำรุงในประเทศไทย",
      ],
      evaluationCriteria: [
        { label: "ด้านเทคนิค", weight: 60 },
        { label: "ด้านราคา", weight: 40 },
      ],
      generatedAt: daysFromToday(-8),
      confidence: "สูง",
    },
  },
  {
    id: "tor-2026-0121",
    title: "จ้างเหมาบริการทำความสะอาดอาคารสำนักงานเขตและพื้นที่โดยรอบ",
    agency: "สำนักงานเขตบางรัก",
    department: "ฝ่ายปกครอง",
    category: "งานบริการ",
    budget: 3200000,
    announceDate: daysFromToday(-30),
    deadline: daysFromToday(-2),
    status: "ปิดรับแล้ว",
    projectCode: "กทม.-SRV-2569-0121",
    location: "เขตบางรัก",
    views: 288,
    documentUrl: "#",
    description:
      "จ้างเหมาบริการทำความสะอาดอาคารสำนักงานเขตบางรักและพื้นที่โดยรอบ ระยะเวลาสัญญา 1 ปี",
    summary: {
      keyPoints: [
        "ทำความสะอาดพื้นที่รวมประมาณ 4,500 ตารางเมตร",
        "ระยะเวลาสัญญา 1 ปี ต่ออายุได้ตามผลประเมิน",
      ],
      qualifications: [
        "มีประสบการณ์ให้บริการทำความสะอาดหน่วยงานราชการไม่น้อยกว่า 2 ปี",
      ],
      evaluationCriteria: [{ label: "ด้านราคา", weight: 100 }],
      generatedAt: daysFromToday(-29),
      confidence: "ปานกลาง",
    },
  },
  {
    id: "tor-2026-0118",
    title: "จ้างบำรุงรักษาระบบกล้องโทรทัศน์วงจรปิด (CCTV) พื้นที่สาธารณะ",
    agency: "สำนักการจราจรและขนส่ง",
    department: "กองระบบจราจรอัจฉริยะ",
    category: "บำรุงรักษา",
    budget: 6400000,
    announceDate: daysFromToday(-3),
    deadline: daysFromToday(21),
    status: "เปิดรับ",
    projectCode: "กทม.-MNT-2569-0118",
    location: "กรุงเทพมหานคร",
    views: 402,
    documentUrl: "#",
    description:
      "จ้างเหมาบำรุงรักษากล้องโทรทัศน์วงจรปิดในพื้นที่สาธารณะ จำนวน 1,200 จุด ระยะเวลา 2 ปี พร้อมศูนย์ควบคุมและแจ้งเตือนเหตุการณ์",
    summary: {
      keyPoints: [
        "บำรุงรักษากล้อง CCTV จำนวน 1,200 จุดทั่วกรุงเทพมหานคร",
        "กำหนดเวลาตอบสนองการซ่อมแซมไม่เกิน 24 ชั่วโมง",
        "ระยะเวลาสัญญา 2 ปี พร้อมรายงานสถานะรายเดือน",
      ],
      qualifications: [
        "มีทีมช่างเทคนิคประจำพื้นที่กรุงเทพมหานครไม่น้อยกว่า 10 คน",
        "มีผลงานบำรุงรักษาระบบ CCTV ภาครัฐมูลค่าไม่ต่ำกว่า 3 ล้านบาท",
      ],
      evaluationCriteria: [
        { label: "ด้านเทคนิค", weight: 50 },
        { label: "ด้านราคา", weight: 50 },
      ],
      generatedAt: daysFromToday(-2),
      confidence: "สูง",
    },
  },
  {
    id: "tor-2026-0111",
    title: "จ้างที่ปรึกษาประเมินผลกระทบสิ่งแวดล้อมโครงการก่อสร้างสวนสาธารณะริมคลอง",
    agency: "สำนักสิ่งแวดล้อม",
    department: "กองจัดการคุณภาพสิ่งแวดล้อม",
    category: "สิ่งแวดล้อม",
    budget: 4900000,
    announceDate: daysFromToday(-11),
    deadline: daysFromToday(5),
    status: "ใกล้ปิดรับ",
    projectCode: "กทม.-ENV-2569-0111",
    location: "เขตคลองเตย",
    views: 197,
    documentUrl: "#",
    description:
      "จ้างที่ปรึกษาจัดทำรายงานประเมินผลกระทบสิ่งแวดล้อม (EIA) สำหรับโครงการก่อสร้างสวนสาธารณะริมคลองพื้นที่เขตคลองเตย",
    summary: {
      keyPoints: [
        "จัดทำรายงาน EIA ตามหลักเกณฑ์ของสำนักงานนโยบายและแผนทรัพยากรธรรมชาติ",
        "ต้องจัดประชุมรับฟังความคิดเห็นชุมชนโดยรอบพื้นที่โครงการ",
      ],
      qualifications: [
        "บริษัทที่ปรึกษาต้องขึ้นทะเบียนผู้จัดทำรายงาน EIA กับหน่วยงานที่กำกับดูแล",
      ],
      evaluationCriteria: [
        { label: "ด้านเทคนิค", weight: 75 },
        { label: "ด้านราคา", weight: 25 },
      ],
      generatedAt: daysFromToday(-10),
      confidence: "ปานกลาง",
    },
  },
  {
    id: "tor-2026-0104",
    title: "จัดซื้อครุภัณฑ์คอมพิวเตอร์และอุปกรณ์ต่อพ่วงสำหรับโรงเรียนในสังกัด",
    agency: "สำนักการศึกษา",
    department: "กองเทคโนโลยีเพื่อการเรียนการสอน",
    category: "จัดซื้อครุภัณฑ์",
    budget: 9800000,
    announceDate: daysFromToday(-25),
    deadline: daysFromToday(12),
    status: "เปิดรับ",
    projectCode: "กทม.-EDU-2569-0104",
    location: "โรงเรียนในสังกัดกรุงเทพมหานคร 40 แห่ง",
    views: 733,
    documentUrl: "#",
    description:
      "จัดซื้อคอมพิวเตอร์ตั้งโต๊ะ โน้ตบุ๊ก และอุปกรณ์ต่อพ่วง สำหรับห้องปฏิบัติการคอมพิวเตอร์ในโรงเรียนสังกัดกรุงเทพมหานคร 40 แห่ง",
    summary: {
      keyPoints: [
        "จัดซื้อคอมพิวเตอร์รวม 1,600 เครื่อง กระจาย 40 โรงเรียน",
        "รับประกันสินค้าไม่น้อยกว่า 3 ปี พร้อมอะไหล่ทดแทน",
      ],
      qualifications: [
        "เป็นตัวแทนจำหน่ายที่ได้รับการรับรองจากเจ้าของผลิตภัณฑ์",
      ],
      evaluationCriteria: [{ label: "ด้านราคา", weight: 100 }],
      generatedAt: daysFromToday(-24),
      confidence: "สูง",
    },
  },
];

export function formatBudget(amount: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatThaiDate(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function daysUntil(iso: string): number {
  const today = new Date("2026-08-09");
  const target = new Date(iso);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function getTORById(id: string): TOR | undefined {
  return torList.find((t) => t.id === id);
}
