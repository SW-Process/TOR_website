"use client";

import { useAuth } from "@/lib/useAuth";

/** "สวัสดี, <name>" for the logged-in admin; generic until the session loads. */
export default function AdminGreeting() {
  const { displayName } = useAuth();
  return <>สวัสดี, {displayName || "ผู้ดูแลระบบ"}</>;
}
