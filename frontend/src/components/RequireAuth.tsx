"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/useAuth";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { ready, isLoggedIn } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !isLoggedIn) {
      // Keep the query too (e.g. /account/settings?section=searches) so sign-in returns to the
      // same view. Read from window here rather than useSearchParams, which would need a
      // Suspense boundary on every page that uses this guard.
      const back = `${pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(back)}`);
    }
  }, [ready, isLoggedIn, router, pathname]);

  if (!ready) return null;

  if (!isLoggedIn) {
    return (
      <div className="container-page py-24 text-center text-sm text-[var(--color-text-muted)]">
        กำลังนำคุณไปยังหน้าเข้าสู่ระบบ...
      </div>
    );
  }

  return <>{children}</>;
}
