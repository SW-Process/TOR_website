"use client";

import { useEffect, useState } from "react";
import { Loader2, LogOut, Search, ShieldAlert } from "lucide-react";
import AdminPageHeader from "./AdminPageHeader";
import { apiFetch } from "@/lib/api";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

interface FoundUser {
  id: string;
  email: string;
  role: "vendor" | "admin";
  sessions: number;
}

const ROLE_LABELS: Record<FoundUser["role"], string> = { vendor: "ผู้ประกอบการ", admin: "ผู้ดูแลระบบ" };

/**
 * Admin session controls (ASVS 7.4.5): sign one user out of every device (e.g. after they
 * report a lost laptop), or sign everybody out after a suspected breach.
 */
export default function SecurityControls() {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 300);
  const [found, setUsers] = useState<FoundUser[]>([]);
  const users = debounced.length < 3 ? [] : found;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [allBusy, setAllBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    if (debounced.length < 3) return;
    let cancelled = false;
    void apiFetch(`/api/admin/users?${new URLSearchParams({ email: debounced })}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ data: FoundUser[] }>) : { data: [] }))
      .then((b) => !cancelled && setUsers(b.data))
      .catch(() => !cancelled && setUsers([]));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  async function revokeUser(user: FoundUser) {
    setBusyId(user.id);
    setMessage("");
    const res = await apiFetch(`/api/admin/users/${user.id}/sessions/revoke`, { method: "POST" }).catch(() => null);
    setBusyId(null);
    if (!res?.ok) return setMessage("ออกจากระบบให้ผู้ใช้ไม่สำเร็จ กรุณาลองใหม่");
    const { ended } = (await res.json()) as { ended: number };
    setUsers((list) => list.map((u) => (u.id === user.id ? { ...u, sessions: 0 } : u)));
    setMessage(`ออกจากระบบ ${user.email} แล้ว (${ended} อุปกรณ์)`);
  }

  async function revokeAll() {
    setAllBusy(true);
    setMessage("");
    const res = await apiFetch("/api/admin/sessions/revoke-all", { method: "POST" }).catch(() => null);
    setAllBusy(false);
    setConfirmAll(false);
    if (!res?.ok) return setMessage("ออกจากระบบทุกคนไม่สำเร็จ กรุณาลองใหม่");
    const { ended } = (await res.json()) as { ended: number };
    setMessage(`ออกจากระบบทุกอุปกรณ์แล้ว ${ended} เซสชัน (ยกเว้นเครื่องนี้)`);
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="ความปลอดภัย"
        title="จัดการการเข้าสู่ระบบ"
        description="ออกจากระบบให้ผู้ใช้ที่แจ้งว่าบัญชีอาจถูกใช้โดยผู้อื่น หรือออกจากระบบทุกคนเมื่อสงสัยว่าระบบถูกบุกรุก ทุกการกระทำถูกบันทึกใน security log"
      />

      <div className="mx-5 mt-6 flex flex-col gap-6 sm:mx-8">
        {message && (
          <p className="rounded-2xl bg-[var(--color-surface-alt)] px-4 py-3 text-sm text-[var(--color-text)]" role="status">
            {message}
          </p>
        )}

        <section className="rounded-3xl border border-[var(--color-border)] bg-white p-5 sm:p-6">
          <h2 className="text-base font-bold text-[var(--color-text)]">ออกจากระบบให้ผู้ใช้หนึ่งคน</h2>
          <label className="mt-4 flex items-center gap-2.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3">
            <Search size={16} className="text-[var(--color-text-faint)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="พิมพ์อีเมลอย่างน้อย 3 ตัวอักษร"
              className="w-full bg-transparent text-sm focus:outline-none"
            />
          </label>
          <ul className="mt-3 flex flex-col divide-y divide-[var(--color-border)]">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-[var(--color-text)]">{u.email}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {ROLE_LABELS[u.role]} · เข้าสู่ระบบอยู่ {u.sessions} อุปกรณ์
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busyId === u.id || u.sessions === 0}
                  onClick={() => void revokeUser(u)}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3.5 py-2 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-alt)] disabled:opacity-50"
                >
                  {busyId === u.id ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
                  ออกจากระบบทุกอุปกรณ์
                </button>
              </li>
            ))}
            {debounced.length >= 3 && users.length === 0 && (
              <li className="py-3 text-sm text-[var(--color-text-muted)]">ไม่พบบัญชีที่ตรงกับอีเมลนี้</li>
            )}
          </ul>
        </section>

        <section className="rounded-3xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-bg)]/40 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-base font-bold text-[var(--color-danger)]">
            <ShieldAlert size={18} />
            ออกจากระบบทุกคน
          </h2>
          <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">
            ผู้ใช้ทุกคน รวมถึงผู้ดูแลระบบคนอื่น จะต้องเข้าสู่ระบบใหม่ เครื่องที่คุณใช้อยู่จะยังเข้าสู่ระบบอยู่
          </p>
          {confirmAll ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={allBusy}
                onClick={() => void revokeAll()}
                className="flex items-center gap-1.5 rounded-full bg-[var(--color-danger)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {allBusy && <Loader2 size={14} className="animate-spin" />}
                ยืนยัน ออกจากระบบทุกคน
              </button>
              <button
                type="button"
                disabled={allBusy}
                onClick={() => setConfirmAll(false)}
                className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm font-semibold"
              >
                ยกเลิก
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmAll(true)}
              className="mt-4 rounded-full border border-[var(--color-danger)] px-4 py-2.5 text-sm font-semibold text-[var(--color-danger)] hover:bg-white"
            >
              ออกจากระบบทุกคน…
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
