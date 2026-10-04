import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AdminChatWidget from "@/components/AdminChatWidget";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex flex-1 flex-col">{children}</main>
      <Footer />
      <AdminChatWidget />
      <KeyboardShortcuts />
    </div>
  );
}
