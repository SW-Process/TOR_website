import type { Metadata } from "next";
import HelpShell, { HelpEmpty, HelpRow, HelpSection } from "@/components/help/HelpShell";
import { AnnouncementMeta, announcementTitle } from "@/components/help/announcementBits";
import { fetchHelpHome } from "@/lib/helpApi";

export const metadata: Metadata = { title: "ศูนย์ช่วยเหลือ | TOR Checker" };

export default async function HelpHomePage() {
  const home = await fetchHelpHome();
  const categories = home?.categories ?? [];

  return (
    <HelpShell categories={categories}>
      <div className="flex flex-col gap-14">
        <HelpSection
          title="ประกาศ"
          more={home && home.announcementCount > home.announcements.length ? { href: "/help/announcements", label: "ดูประกาศทั้งหมด" } : undefined}
        >
          {!home ? (
            <HelpEmpty>โหลดศูนย์ช่วยเหลือไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</HelpEmpty>
          ) : home.announcements.length === 0 ? (
            <HelpEmpty>ยังไม่มีประกาศ</HelpEmpty>
          ) : (
            home.announcements.map((a) => (
              <HelpRow key={a.id} href={`/help/announcements/${a.id}`} title={announcementTitle(a)} meta={<AnnouncementMeta a={a} />} />
            ))
          )}
        </HelpSection>

        <HelpSection title="คำถามที่พบบ่อย" more={{ href: "/help/faq", label: "ดูคำถามทั้งหมด" }}>
          {!home || home.faqs.length === 0 ? (
            <HelpEmpty>ยังไม่มีคำถามที่พบบ่อย</HelpEmpty>
          ) : (
            home.faqs.map((f) => <HelpRow key={f.id} href={`/help/faq/${f.id}`} title={f.question} />)
          )}
        </HelpSection>
      </div>
    </HelpShell>
  );
}
