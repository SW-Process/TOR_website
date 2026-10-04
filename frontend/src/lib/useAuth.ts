"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE, apiFetch } from "./api";

export type UserRole = "vendor" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  /** Chosen display name, or null to fall back to the email's local part. */
  displayName: string | null;
  role: UserRole;
  avatarUrl: string | null;
  /** false for Google-only accounts, which have never set a password. */
  hasPassword: boolean;
  googleLinked: boolean;
}

interface ApiUser {
  _id?: string;
  id?: string;
  email: string;
  displayName?: string | null;
  role: UserRole;
  avatarUrl?: string | null;
  hasPassword?: boolean;
  googleLinked?: boolean;
}

function toAuthUser(u: ApiUser): AuthUser {
  return {
    id: u._id ?? u.id ?? "",
    email: u.email,
    displayName: u.displayName ?? null,
    role: u.role,
    avatarUrl: u.avatarUrl ?? null,
    hasPassword: u.hasPassword ?? true,
    googleLinked: u.googleLinked ?? false,
  };
}

export interface AuthResult {
  ok: boolean;
  error?: string;
}

// Module-level cache so every useAuth() shares one session check, and a
// navigation doesn't re-hit /api/auth/me. A hard reload re-checks.
let cachedUser: AuthUser | null = null;
let checked = false;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

async function loadSession(): Promise<void> {
  try {
    const res = await apiFetch("/api/auth/me");
    if (res.ok) {
      const data = (await res.json()) as { user: ApiUser };
      cachedUser = toAuthUser(data.user);
    } else {
      cachedUser = null;
    }
  } catch {
    cachedUser = null;
  }
  checked = true;
}

async function ensureLoaded(): Promise<void> {
  if (checked) return;
  inFlight ??= loadSession();
  await inFlight;
  inFlight = null;
  emit();
}

async function refreshSession(): Promise<void> {
  checked = false;
  inFlight = null;
  await ensureLoaded();
}

function readError(status: number, body: { message?: string }): string {
  if (status === 409) return "อีเมลนี้ถูกใช้สมัครแล้ว";
  if (status === 401) return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
  return body.message || "เกิดข้อผิดพลาด กรุณาลองใหม่";
}

/** Thai copy for the account-settings endpoints' errors (backend messages are English). */
function readAccountError(status: number, body: { message?: string }): string {
  if (status === 401) return "รหัสผ่านปัจจุบันไม่ถูกต้อง";
  if (status === 409) return "อีเมลนี้ถูกใช้กับบัญชีอื่นแล้ว";
  if (status === 403) return "บัญชีผู้ดูแลระบบลบจากหน้านี้ไม่ได้";
  const msg = body.message ?? "";
  if (msg.startsWith("Password must be")) return "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร";
  if (msg.startsWith("Display name")) return "ชื่อต้องไม่เกิน 60 ตัวอักษร";
  if (msg.startsWith("A valid email")) return "รูปแบบอีเมลไม่ถูกต้อง";
  if (msg.startsWith("Set a password")) return "กรุณาตั้งรหัสผ่านก่อนเปลี่ยนอีเมล";
  if (msg.startsWith("Type your account email")) return "อีเมลที่พิมพ์ไม่ตรงกับบัญชีนี้";
  if (msg.startsWith("Set a password before disconnecting")) return "กรุณาตั้งรหัสผ่านก่อนยกเลิกการเชื่อมต่อ Google";
  return "เกิดข้อผิดพลาด กรุณาลองใหม่";
}

/** Send a JSON account request; on success refresh the cached session from the response. */
async function sendAccount(method: string, path: string, payload: object): Promise<AuthResult> {
  let res: Response;
  try {
    res = await apiFetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่" };
  }
  const body = (await res.json().catch(() => ({}))) as { message?: string; user?: ApiUser };
  if (!res.ok) return { ok: false, error: readAccountError(res.status, body) };
  cachedUser = body.user ? toAuthUser(body.user) : null;
  checked = true;
  emit();
  return { ok: true };
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(cachedUser);
  const [ready, setReady] = useState(checked);

  useEffect(() => {
    const sync = () => {
      setUser(cachedUser);
      setReady(checked);
    };
    listeners.add(sync);
    void ensureLoaded().then(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);

  const submitCredentials = useCallback(
    async (path: string, email: string, password: string): Promise<AuthResult> => {
      let res: Response;
      try {
        res = await apiFetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
      } catch {
        return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่" };
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        return { ok: false, error: readError(res.status, body) };
      }
      await refreshSession();
      return { ok: true };
    },
    []
  );

  const login = useCallback(
    (email: string, password: string) => submitCredentials("/api/auth/login", email, password),
    [submitCredentials]
  );

  const register = useCallback(
    (email: string, password: string) => submitCredentials("/api/auth/register", email, password),
    [submitCredentials]
  );

  const logout = useCallback(async () => {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    cachedUser = null;
    checked = true;
    emit();
  }, []);

  const uploadAvatar = useCallback(async (file: File): Promise<AuthResult> => {
    const body = new FormData();
    body.append("avatar", file);

    let res: Response;
    try {
      res = await apiFetch("/api/auth/avatar", { method: "POST", body });
    } catch {
      return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่" };
    }
    if (!res.ok) {
      const respBody = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, error: respBody.message || "อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่" };
    }
    await refreshSession();
    return { ok: true };
  }, []);

  const startGoogleLogin = useCallback(() => {
    // Full-page navigation to the backend (a different origin), which then
    // redirects to Google — not an internal Next.js route.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `${API_BASE}/api/auth/google`;
  }, []);

  const updateDisplayName = useCallback(
    (displayName: string) => sendAccount("PATCH", "/api/auth/me", { displayName }),
    []
  );

  const changePassword = useCallback(
    (currentPassword: string, newPassword: string) =>
      sendAccount("PUT", "/api/auth/password", { currentPassword, newPassword }),
    []
  );

  const changeEmail = useCallback(
    (email: string, currentPassword: string) => sendAccount("PUT", "/api/auth/email", { email, currentPassword }),
    []
  );

  /** Full-page trip to Google to link it to this account; lands back on the security settings. */
  const linkGoogle = useCallback(() => {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `${API_BASE}/api/auth/google/link`;
  }, []);

  const unlinkGoogle = useCallback(() => sendAccount("DELETE", "/api/auth/google", {}), []);

  /** Signs out every other device; this one gets a fresh cookie and stays signed in. */
  const logoutOthers = useCallback(() => sendAccount("POST", "/api/auth/logout-others", {}), []);

  /** Permanently deletes the account; the response carries no user, so the session clears. */
  const deleteAccount = useCallback(
    (confirm: { currentPassword?: string; confirmEmail?: string }) => sendAccount("DELETE", "/api/auth/me", confirm),
    []
  );

  return {
    user,
    displayName: user ? user.displayName || user.email.split("@")[0] : "",
    avatarSrc: user?.avatarUrl ? `${API_BASE}${user.avatarUrl}` : null,
    ready,
    isLoggedIn: !!user,
    login,
    register,
    logout,
    startGoogleLogin,
    uploadAvatar,
    updateDisplayName,
    changePassword,
    changeEmail,
    logoutOthers,
    linkGoogle,
    unlinkGoogle,
    deleteAccount,
    refresh: refreshSession,
  };
}
