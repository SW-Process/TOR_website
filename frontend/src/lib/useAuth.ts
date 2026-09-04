"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const STORAGE_KEY = "tor-insight:auth";
const AUTH_EVENT = "tor-insight:auth-changed";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "vendor" | "admin";
}

interface BackendUser {
  _id: string;
  email: string;
  role: "vendor" | "admin";
}

function toAuthUser(u: BackendUser): AuthUser {
  return { id: u._id, email: u.email, role: u.role, name: u.email.split("@")[0] };
}

function readStorage(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function writeStorage(user: AuthUser | null): void {
  if (user) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  else window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(readStorage());

    const sync = () => setUser(readStorage());
    window.addEventListener(AUTH_EVENT, sync);
    window.addEventListener("storage", sync);

    // The auth token lives in an HttpOnly cookie, so this is the only way to
    // know whether the session is still valid (also refreshes the cached
    // profile shown before this resolves).
    apiFetch<{ user: BackendUser }>("/auth/me")
      .then(({ user: me }) => writeStorage(toAuthUser(me)))
      .catch(() => writeStorage(null))
      .finally(() => setReady(true));

    return () => {
      window.removeEventListener(AUTH_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: me } = await apiFetch<{ user: BackendUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    writeStorage(toAuthUser(me));
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const { user: me } = await apiFetch<{ user: BackendUser }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    writeStorage(toAuthUser(me));
  }, []);

  const logout = useCallback(async () => {
    writeStorage(null);
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // session cookie is already gone from the client's perspective
    }
  }, []);

  return { user, ready, isLoggedIn: !!user, login, register, logout };
}
