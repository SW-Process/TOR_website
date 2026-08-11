import {
  Database,
  Target,
  Users,
  Clock,
  UserCheck,
  Lock,
  RefreshCw,
  ShieldCheck,
  Mail,
} from "lucide-react";

const sections = [
  {
    icon: Database,
    title: "ข้อมูลที่เราเก็บรวบรวม",
    body: "เราเก็บรวบรวมข้อมูลส่วนบุคคลเท่าที่จำเป็นต่อการให้บริการ ได้แก่ ชื่อ-นามสกุล อีเมล และรหัสผ่าน (จัดเก็บในรูปแบบเข้ารหัส) ที่ท่านให้ไว้ในขั้นตอนการสมัครสมาชิก รวมถึงรายการ TOR ที่ท่านบันทึกไว้ในระบบ",
  },
  {
    icon: Target,
    title: "วัตถุประสงค์ในการใช้ข้อมูล",
    body: "ข้อมูลของท่านจะถูกใช้เพื่อยืนยันตัวตนในการเข้าสู่ระบบ จัดส่งการแจ้งเตือนเกี่ยวกับ TOR ที่ท่านสนใจทางอีเมล และปรับปรุงคุณภาพการให้บริการของแพลตฟอร์ม เราจะไม่นำข้อมูลของท่านไปใช้เพื่อวัตถุประสงค์อื่นโดยไม่ได้รับความยินยอม",
  },
  {
    icon: Users,
    title: "การเปิดเผยข้อมูลต่อบุคคลที่สาม",
    body: "เราจะไม่เปิดเผย ขาย หรือให้เช่าข้อมูลส่วนบุคคลของท่านแก่บุคคลภายนอก เว้นแต่ได้รับความยินยอมจากท่าน หรือเป็นไปตามที่กฎหมายกำหนด",
  },
  {
    icon: Clock,
    title: "ระยะเวลาการจัดเก็บข้อมูล",
    body: "เราจะจัดเก็บข้อมูลส่วนบุคคลของท่านตลอดระยะเวลาที่ท่านยังคงเป็นสมาชิก และจะลบหรือทำให้ข้อมูลไม่สามารถระบุตัวตนได้ภายใน 90 วัน หลังจากท่านยกเลิกบัญชีผู้ใช้งาน",
  },
  {
    icon: UserCheck,
    title: "สิทธิของเจ้าของข้อมูล",
    body: "ท่านมีสิทธิขอเข้าถึง แก้ไข ลบ หรือถอนความยินยอมในการประมวลผลข้อมูลส่วนบุคคลของท่านได้ตลอดเวลา โดยติดต่อผ่านช่องทางที่ระบุไว้ด้านล่าง",
  },
  {
    icon: Lock,
    title: "มาตรการรักษาความปลอดภัยของข้อมูล",
    body: "เรามีมาตรการทางเทคนิคและการบริหารจัดการที่เหมาะสม เพื่อป้องกันการเข้าถึง แก้ไข หรือทำลายข้อมูลส่วนบุคคลของท่านโดยไม่ได้รับอนุญาต",
  },
  {
    icon: RefreshCw,
    title: "การเปลี่ยนแปลงนโยบาย",
    body: "เราอาจปรับปรุงนโยบายความเป็นส่วนตัวฉบับนี้เป็นครั้งคราว โดยจะแจ้งให้ท่านทราบผ่านหน้าเว็บไซต์เมื่อมีการเปลี่ยนแปลงที่มีนัยสำคัญ",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="relative overflow-hidden bg-[linear-gradient(135deg,_var(--color-blush-deep)_0%,_var(--color-blush)_45%,_var(--color-blush-soft)_100%)] px-4 py-14 sm:py-20">
        <div
          className="absolute inset-0 opacity-[0.35] [background-image:radial-gradient(rgba(34,26,24,0.18)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_40%,black_10%,transparent_75%)]"
          aria-hidden
        />
        <div className="animate-blob-a pointer-events-none absolute -top-16 -right-10 h-96 w-96 rounded-full bg-[var(--color-rose-light)] blur-3xl opacity-80" aria-hidden />
        <div
          className="animate-blob-b pointer-events-none absolute bottom-0 -left-16 h-80 w-80 rounded-full bg-[var(--color-blush-deep)] blur-3xl opacity-70"
          style={{ animationDelay: "-3s" }}
          aria-hidden
        />

        <div className="container-page relative flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[var(--color-rose-dark)] shadow-[var(--shadow-md)]">
            <ShieldCheck size={26} />
          </span>
          <span className="eyebrow mt-4">PDPA</span>
          <h1 className="mt-2 font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-extrabold text-[var(--color-text)]">
            นโยบายความเป็นส่วนตัว
          </h1>
          <p className="mt-3 max-w-xl text-sm sm:text-base text-[var(--color-text-muted)] leading-relaxed">
            TOR Checker ให้ความสำคัญกับการคุ้มครองข้อมูลส่วนบุคคลของท่านตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล
            พ.ศ. 2562 (PDPA) นโยบายฉบับนี้อธิบายวิธีที่เราเก็บรวบรวม ใช้ และคุ้มครองข้อมูลส่วนบุคคลของท่าน
          </p>
          <span className="badge mt-5 bg-white text-[var(--color-text-muted)] shadow-[var(--shadow-sm)]">
            ปรับปรุงล่าสุด: 11 สิงหาคม 2569
          </span>
        </div>
      </div>

      <div className="container-page -mt-8 sm:-mt-10 pb-16">
        <div className="mx-auto max-w-3xl flex flex-col gap-4">
          {sections.map((section, i) => {
            const Icon = section.icon;
            return (
              <div
                key={section.title}
                className="card relative flex gap-4 p-5 sm:p-6 shadow-[var(--shadow-md)]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-rose-light)] text-[var(--color-rose-dark)]">
                  <Icon size={18} />
                </span>
                <div>
                  <span className="text-xs font-semibold text-[var(--color-text-faint)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h2 className="mt-0.5 font-[family-name:var(--font-heading)] text-base sm:text-lg font-bold text-[var(--color-text)]">
                    {section.title}
                  </h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-muted)]">
                    {section.body}
                  </p>
                </div>
              </div>
            );
          })}

          <div className="card mt-2 flex flex-col items-center gap-3 bg-[linear-gradient(160deg,_#ffffff_0%,_#ffffff_45%,_var(--color-blush-soft)_100%)] p-7 text-center shadow-[var(--shadow-md)] sm:p-8">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-rose-light)] text-[var(--color-rose-dark)]">
              <Mail size={18} />
            </span>
            <h2 className="font-[family-name:var(--font-heading)] text-base font-bold text-[var(--color-text)]">
              มีคำถามเกี่ยวกับข้อมูลส่วนบุคคลของท่าน?
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-[var(--color-text-muted)]">
              ติดต่อทีมงานเพื่อขอเข้าถึง แก้ไข หรือลบข้อมูลส่วนบุคคลของท่านได้ที่
            </p>
            <span className="text-sm font-semibold text-[var(--color-rose-dark)]">
              support@tor-insight.go.th (ตัวอย่าง)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
