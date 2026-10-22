"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/useAuth";

/**
 * The admin API refuses admins whose session didn't pass two-step verification
 * (`mfa_required`, ASVS 6.3.3). Rather than a panel full of errors, explain what to do:
 * set it up, or, when it's already on, sign in again with a code.
 */
export default function AdminMfaGate({ children }: { children: React.ReactNode }) {
  const { ready, user, logout } = useAuth();
  const router = useRouter();
  if (!ready || !user || user.role !== "admin" || !user.mfaRequired || user.sessionMfa) return <>{children}</>;

  return (
    <div className="mx-5 mt-10 max-w-xl rounded-3xl border border-[var(--color-border)] bg-white p-7 sm:mx-8">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-warning-bg)] text-[var(--color-warning)]">
        <ShieldAlert size={22} />
      </span>
      <h1 className="mt-4 font-[family-name:var(--font-heading)] text-xl font-extrabold text-[var(--color-text)]">
        ต้องยืนยันตัวตนสองขั้นตอนก่อนใช้หน้าผู้ดูแลระบบ
      </h1>
      {user.mfaEnabled ? (
        <>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">
            การเข้าสู่ระบบครั้งนี้ยังไม่ได้ใช้รหัสจากแอปยืนยันตัวตน กรุณาออกจากระบบ แล้วเข้าสู่ระบบใหม่พร้อมรหัส 6 หลัก
          </p>
          <button
            type="button"
            onClick={async () => {
              await logout();
              router.push("/login?next=/admin");
            }}
            className="mt-5 rounded-full bg-[var(--color-ink)] px-5 py-3 text-sm font-semibold text-white hover:bg-black"
          >
            เข้าสู่ระบบใหม่
          </button>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">
            บัญชีผู้ดูแลระบบเข้าถึงข้อมูลและการตั้งค่าของทั้งระบบ จึงต้องป้องกันด้วยรหัสจากแอปยืนยันตัวตนนอกเหนือจากรหัสผ่าน
          </p>
          <Link
            href="/account/settings?section=mfa"
            className="mt-5 inline-block rounded-full bg-[var(--color-ink)] px-5 py-3 text-sm font-semibold text-white hover:bg-black"
          >
            ตั้งค่าการยืนยันตัวตนสองขั้นตอน
          </Link>
        </>
      )}
    </div>
  );
}
