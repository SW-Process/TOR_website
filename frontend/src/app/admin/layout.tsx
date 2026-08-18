import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminMobileNav from "@/components/admin/AdminMobileNav";
import AdminTopbar from "@/components/admin/AdminTopbar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-[#e6dedb] p-3 sm:p-6 lg:p-8">
      <div className="mx-auto flex min-h-[calc(100svh-3rem)] max-w-[1500px] overflow-hidden rounded-[2rem] bg-white shadow-[0_30px_60px_-15px_rgba(90,80,90,0.22)] ring-1 ring-white">
        <AdminSidebar />
        <div className="flex-1 min-w-0 flex flex-col bg-[var(--color-surface-alt)]">
          <AdminMobileNav />
          <AdminTopbar />
          <main className="flex-1 pb-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
