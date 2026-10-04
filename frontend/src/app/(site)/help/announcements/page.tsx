import type { Metadata } from "next";
import HelpShell, { HelpEmpty, HelpRow, HelpSection } from "@/components/help/HelpShell";
import { AnnouncementMeta, announcementTitle } from "@/components/help/announcementBits";
import { fetchAnnouncements, fetchHelpHome } from "@/lib/helpApi";

export const metadata: Metadata = { title: "ประกาศ | ศูนย์ช่วยเหลือ TOR Checker" };

export default async function HelpAnnouncementsPage() {
  const [home, announcements] = await Promise.all([fetchHelpHome(), fetchAnnouncements()]);

  return (
    <HelpShell categories={home?.categories ?? []} breadcrumb={[{ label: "ประกาศ" }]}>
      <HelpSection title="ประกาศ">
        {announcements.length === 0 ? (
          <HelpEmpty>ยังไม่มีประกาศ</HelpEmpty>
        ) : (
          announcements.map((a) => (
            <HelpRow key={a.id} href={`/help/announcements/${a.id}`} title={announcementTitle(a)} meta={<AnnouncementMeta a={a} />} />
          ))
        )}
      </HelpSection>
    </HelpShell>
  );
}
