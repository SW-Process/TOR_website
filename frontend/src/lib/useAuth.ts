"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE, apiFetch } from "./api";

export type UserRole = "vendor" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
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
      const data = (await res.json()) as { user: { _id?: string; id?: string; email: string; role: UserRole } };
      const u = data.user;
      cachedUser = { id: u._id ?? u.id ?? "", email: u.email, role: u.role };
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

  const login = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, error: readError(res.status, body) };
    }
    await refreshSession();
    return { ok: true };
  }, []);

  const register = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const res = await apiFetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, error: readError(res.status, body) };
    }
    await refreshSession();
    return { ok: true };
  }, []);

  const logout = useCallback(async () => {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    cachedUser = null;
    checked = true;
    emit();
  }, []);

  const startGoogleLogin = useCallback(() => {
    // Full-page navigation to the backend (a different origin), which then
    // redirects to Google — not an internal Next.js route.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `${API_BASE}/api/auth/google`;
  }, []);

  return {
    user,
    displayName: user ? user.email.split("@")[0] : "",
    ready,
    isLoggedIn: !!user,
    login,
    register,
    logout,
    startGoogleLogin,
    refresh: refreshSession,
  };
}
