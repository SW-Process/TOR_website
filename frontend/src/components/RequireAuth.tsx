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
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
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
