"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Lock, Mail } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [signingIn, setSigningIn] = useState(false);

  return (
    <div className="relative flex flex-1 items-center overflow-hidden bg-[linear-gradient(135deg,_var(--color-blush-deep)_0%,_var(--color-blush)_40%,_var(--color-blush-soft)_75%,_#ffffff_100%)]">
      <div
        className="absolute inset-0 opacity-[0.35] [background-image:radial-gradient(rgba(34,26,24,0.18)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_80%_60%_at_70%_30%,black_10%,transparent_75%)]"
        aria-hidden
      />
      <div className="animate-blob-a pointer-events-none absolute -top-16 -right-10 h-96 w-96 rounded-full bg-[var(--color-rose-light)] blur-3xl opacity-80" aria-hidden />
      <div
        className="animate-blob-b pointer-events-none absolute bottom-0 -left-16 h-80 w-80 rounded-full bg-[var(--color-blush-deep)] blur-3xl opacity-70"
        style={{ animationDelay: "-3s" }}
        aria-hidden
      />
      <div
        className="animate-blob-c pointer-events-none absolute top-1/3 left-1/2 h-56 w-56 rounded-full bg-white blur-3xl opacity-60"
        style={{ animationDelay: "-1.5s" }}
        aria-hidden
      />

      <div className="container-page relative py-14 sm:py-20">
        <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <div className="hidden lg:block">
            <span className="eyebrow">สำหรับหน่วยงานภาครัฐ</span>
            <h1 className="mt-4 font-[family-name:var(--font-heading)] text-6xl font-extrabold leading-[1.05] tracking-tight text-[var(--color-text)]">
              เข้าสู่ระบบสำหรับ
              <br />
              <span className="text-[var(--color-rose-dark)]">หน่วยงานผู้ประกาศ TOR</span>
            </h1>
            <p className="mt-6 max-w-md text-base text-[var(--color-ink-soft)] leading-relaxed">
              สำหรับเจ้าหน้าที่หน่วยงานในสังกัดกรุงเทพมหานครที่ต้องการเผยแพร่ แก้ไข
              หรือติดตามสถานะประกาศจัดซื้อจัดจ้างของหน่วยงาน
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-sm">
            <div
              className="animate-card-bob absolute -top-9 -right-4 hidden rotate-[4deg] items-center gap-2 rounded-full bg-white px-4 py-2 shadow-[var(--shadow-md)] sm:flex"
              style={{ animationDelay: "-2s" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
              <span className="text-xs font-semibold text-[var(--color-text)]">8 หน่วยงานใช้งานอยู่</span>
            </div>

            <div className="rounded-[2rem] border border-white/60 bg-white/70 p-7 shadow-[var(--shadow-lg)] backdrop-blur-2xl sm:p-9">
              <span className="eyebrow lg:hidden">สำหรับหน่วยงานภาครัฐ</span>
              <h2 className="mt-2 font-[family-name:var(--font-heading)] text-2xl font-extrabold text-[var(--color-text)] lg:mt-0">
                เข้าสู่ระบบหน่วยงาน
              </h2>
              <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">
                สำหรับบัญชีที่ใช้ประกาศและจัดการ TOR
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSigningIn(true);
                  setTimeout(() => router.push("/"), 700);
                }}
                className="mt-7 flex flex-col gap-4"
              >
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[var(--color-text)]">อีเมลหน่วยงาน</span>
                  <div className="flex items-center gap-2.5 rounded-2xl border border-white bg-white/90 px-3.5 py-2.5 shadow-[var(--shadow-sm)] transition-colors focus-within:border-[var(--color-rose-dark)]">
                    <Mail size={16} className="shrink-0 text-[var(--color-text-faint)]" />
                    <input
                      required
                      type="email"
                      placeholder="name@bangkok.go.th"
                      className="w-full bg-transparent text-sm focus:outline-none"
                    />
                  </div>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[var(--color-text)]">รหัสผ่าน</span>
                  <div className="flex items-center gap-2.5 rounded-2xl border border-white bg-white/90 px-3.5 py-2.5 shadow-[var(--shadow-sm)] transition-colors focus-within:border-[var(--color-rose-dark)]">
                    <Lock size={16} className="shrink-0 text-[var(--color-text-faint)]" />
                    <input
                      required
                      type="password"
                      placeholder="••••••••"
                      className="w-full bg-transparent text-sm focus:outline-none"
                    />
                  </div>
                </label>
                <button
                  type="submit"
                  disabled={signingIn}
                  className="mt-1.5 flex items-center justify-center gap-2.5 rounded-full bg-[var(--color-ink)] py-3 text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-colors hover:bg-black disabled:opacity-70"
                >
                  {signingIn ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
                  {!signingIn && <ArrowUpRight size={15} />}
                </button>
              </form>

              <p className="mt-6 text-center text-xs leading-relaxed text-[var(--color-text-muted)]">
                ไม่ใช่เจ้าหน้าที่หน่วยงาน?{" "}
                <Link href="/tor" className="font-semibold text-[var(--color-rose-dark)] hover:underline">
                  ค้นหา TOR ต่อได้เลยโดยไม่ต้องเข้าสู่ระบบ
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
