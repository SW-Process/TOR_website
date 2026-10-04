import {
  Info,
  FileText,
  Sparkles,
  Scale,
  UserCog,
  Ban,
  AlertTriangle,
  RefreshCw,
  Gavel,
  ScrollText,
  Mail,
} from "lucide-react";

const sections = [
  {
    icon: Info,
    title: "ลักษณะของบริการ",
    body: "TOR Checker เป็นแพลตฟอร์มรวบรวมและสรุปประกาศจัดซื้อจัดจ้าง (TOR) ของหน่วยงานในสังกัดกรุงเทพมหานคร เพื่ออำนวยความสะดวกในการค้นหาและติดตามข้อมูล แพลตฟอร์มนี้ไม่ใช่ช่องทางทางการของหน่วยงานรัฐ และไม่ใช่ช่องทางสำหรับยื่นข้อเสนอหรือเอกสารประกวดราคา",
  },
  {
    icon: FileText,
    title: "แหล่งที่มาและความถูกต้องของข้อมูล",
    body: "ข้อมูลประกาศรวบรวมจากระบบจัดซื้อจัดจ้างภาครัฐ (e-GP) ซึ่งอาจมีความล่าช้าหรือคลาดเคลื่อนจากต้นฉบับ ผู้ใช้งานควรตรวจสอบรายละเอียด กำหนดเวลา และเงื่อนไขจากเอกสารต้นฉบับของหน่วยงานเจ้าของประกาศทุกครั้งก่อนนำไปใช้ หากพบข้อมูลไม่ถูกต้อง สามารถแจ้งได้ผ่านปุ่ม \"แจ้งข้อมูลคลาดเคลื่อน\" ในหน้ารายละเอียด TOR",
  },
  {
    icon: Sparkles,
    title: "บทสรุปที่สร้างโดย AI",
    body: "บทสรุปสาระสำคัญในแพลตฟอร์มสร้างขึ้นโดยระบบปัญญาประดิษฐ์ (AI) จากเอกสาร TOR ไม่ใช่ข้อความของหน่วยงานเจ้าของประกาศ และอาจตกหล่นหรือคลาดเคลื่อนได้ บทสรุปมีไว้เพื่อช่วยอ่านเบื้องต้นเท่านั้น ไม่สามารถใช้แทนเอกสารต้นฉบับได้",
  },
  {
    icon: Scale,
    title: "สัญญาณด้านความเป็นธรรม",
    body: "สัญญาณด้านความเป็นธรรม (fairness signals) เป็นข้อสังเกตที่ระบบวิเคราะห์โดยอัตโนมัติ เพื่อชี้จุดที่อาจควรพิจารณาเพิ่มเติม เช่น การระบุยี่ห้อหรือกรอบเวลาที่สั้นกว่าปกติ สัญญาณเหล่านี้ไม่ใช่ข้อสรุปหรือข้อกล่าวหาว่าหน่วยงานหรือบุคคลใดกระทำความผิด ผู้ใช้งานไม่ควรนำไปเผยแพร่ในลักษณะที่ทำให้เข้าใจเช่นนั้น",
  },
  {
    icon: UserCog,
    title: "บัญชีผู้ใช้งาน",
    body: "ผู้ใช้งานต้องให้ข้อมูลที่เป็นจริงในการสมัครสมาชิก และรับผิดชอบในการเก็บรักษารหัสผ่านของตนเป็นความลับ กิจกรรมใดที่เกิดขึ้นภายใต้บัญชีของท่านถือเป็นความรับผิดชอบของท่าน หากสงสัยว่าบัญชีถูกใช้งานโดยไม่ได้รับอนุญาต โปรดแจ้งทีมงานโดยเร็ว",
  },
  {
    icon: Ban,
    title: "ข้อห้ามในการใช้งาน",
    body: "ห้ามใช้แพลตฟอร์มเพื่อการใดที่ผิดกฎหมาย ห้ามดึงข้อมูลจำนวนมากด้วยโปรแกรมอัตโนมัติในลักษณะที่สร้างภาระให้ระบบ ห้ามพยายามเข้าถึงส่วนที่ไม่ได้รับอนุญาต และห้ามนำข้อมูลไปใช้เพื่อหมิ่นประมาทหรือสร้างความเสียหายแก่ผู้อื่น เราขอสงวนสิทธิ์ระงับบัญชีที่ฝ่าฝืนข้อกำหนดนี้",
  },
  {
    icon: AlertTriangle,
    title: "ข้อจำกัดความรับผิด",
    body: "แพลตฟอร์มให้บริการตามสภาพที่เป็นอยู่ เราไม่รับประกันความครบถ้วน ความถูกต้อง หรือความต่อเนื่องของบริการ และไม่รับผิดชอบต่อความเสียหายใดที่เกิดจากการนำข้อมูลในแพลตฟอร์มไปใช้ รวมถึงการพลาดกำหนดยื่นข้อเสนอ",
  },
  {
    icon: RefreshCw,
    title: "การเปลี่ยนแปลงข้อกำหนด",
    body: "เราอาจปรับปรุงข้อกำหนดการใช้งานฉบับนี้เป็นครั้งคราว โดยจะแจ้งผ่านหน้าเว็บไซต์เมื่อมีการเปลี่ยนแปลงที่มีนัยสำคัญ การใช้งานแพลตฟอร์มต่อหลังจากนั้นถือว่าท่านยอมรับข้อกำหนดฉบับปรับปรุง",
  },
  {
    icon: Gavel,
    title: "กฎหมายที่ใช้บังคับ",
    body: "ข้อกำหนดการใช้งานฉบับนี้อยู่ภายใต้บังคับและตีความตามกฎหมายแห่งราชอาณาจักรไทย",
  },
];

export default function TermsOfUsePage() {
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
            <ScrollText size={26} />
          </span>
          <span className="eyebrow mt-4">Terms of Use</span>
          <h1 className="mt-2 font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-extrabold text-[var(--color-text)]">
            ข้อกำหนดการใช้งาน
          </h1>
          <p className="mt-3 max-w-xl text-sm sm:text-base text-[var(--color-text-muted)] leading-relaxed">
            โปรดอ่านข้อกำหนดฉบับนี้ก่อนใช้งาน TOR Checker การเข้าใช้งานแพลตฟอร์มถือว่าท่านได้อ่าน
            เข้าใจ และยอมรับข้อกำหนดการใช้งานทั้งหมดแล้ว
          </p>
          <span className="badge mt-5 bg-white text-[var(--color-text-muted)] shadow-[var(--shadow-sm)]">
            ปรับปรุงล่าสุด: 4 ตุลาคม 2569
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
              มีคำถามเกี่ยวกับข้อกำหนดการใช้งาน?
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-[var(--color-text-muted)]">
              สอบถามเพิ่มเติมหรือแจ้งปัญหาการใช้งานได้ที่
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm font-semibold text-[var(--color-rose-dark)]">
              <a href="mailto:paranyu.lion@gmail.com" className="hover:underline">paranyu.lion@gmail.com</a>
              <a href="tel:+66933239415" className="hover:underline">โทร 093-323-9415</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
