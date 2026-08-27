"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "tor-insight:auth";
const AUTH_EVENT = "tor-insight:auth-changed";

export interface MockUser {
  name: string;
  email: string;
}

function readStorage(): MockUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MockUser) : null;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState<MockUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(readStorage());
    setReady(true);

    const sync = () => setUser(readStorage());
    window.addEventListener(AUTH_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AUTH_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const login = useCallback((next: MockUser) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setUser(next);
    window.dispatchEvent(new Event(AUTH_EVENT));
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    window.dispatchEvent(new Event(AUTH_EVENT));
  }, []);

  return { user, ready, isLoggedIn: !!user, login, logout };
}
