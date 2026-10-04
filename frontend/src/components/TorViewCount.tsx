"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";

/**
 * The detail page's "จำนวนผู้เข้าชม": counts this visit (POST /api/tors/:id/view) and
 * shows it straight away. One count per TOR per tab session, so a refresh or a
 * back-and-forth doesn't add up; it counts page views, not unique people.
 */
export default function TorViewCount({ torId, initial }: { torId: string; initial: number }) {
  const [counted, setCounted] = useState(false);

  useEffect(() => {
    const key = `tor-viewed:${torId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // storage blocked (private mode etc.): still count, just without the per-session guard
    }
    fetch(`${API_BASE}/api/tors/${torId}/view`, { method: "POST", keepalive: true })
      .then((res) => {
        if (res.ok) setCounted(true);
        else throw new Error(`HTTP ${res.status}`);
      })
      .catch(() => {
        try {
          sessionStorage.removeItem(key); // let the next visit try again
        } catch {}
      });
  }, [torId]);

  return <>{(initial + (counted ? 1 : 0)).toLocaleString("th-TH")} ครั้ง</>;
}
