import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import "./globals.css";

const plexSansThai = IBM_Plex_Sans_Thai({
  variable: "--font-body",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "TOR Checker | ค้นหาและวิเคราะห์ประกาศจัดซื้อจัดจ้าง กทม.",
  description:
    "แพลตฟอร์มค้นหา TOR และประกาศจัดซื้อจัดจ้างของกรุงเทพมหานคร พร้อมสรุปสาระสำคัญด้วย AI ค้นหา กรอง บันทึก และรับการแจ้งเตือน TOR ที่ตรงกับคุณ",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      className={`${plexSansThai.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--color-bg)] text-[var(--color-text)]">
        {children}
      </body>
    </html>
  );
}
