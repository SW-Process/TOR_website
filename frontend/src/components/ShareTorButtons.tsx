"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link2 } from "lucide-react";

/** Copy text, falling back to a hidden textarea where the async Clipboard API is unavailable (e.g. plain http). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

/**
 * "Copy link" for a TOR detail page — vendors often forward a TOR to their
 * team. The URL is built at click time from the current origin, so it is right
 * in every environment.
 */
export default function ShareTorButtons({ torId }: { torId: string }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const torUrl = () => `${window.location.origin}/tor/${torId}`;

  async function handleCopy() {
    const ok = await copyText(torUrl());
    setCopied(ok);
    setCopyFailed(!ok);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(false);
      setCopyFailed(false);
    }, 2000);
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="btn-pill w-full border border-[var(--color-border-strong)] bg-white py-2.5 text-sm text-[var(--color-text)] transition-colors hover:border-[var(--color-ink)]"
        style={{ gap: 6 }}
      >
        {copied ? <Check size={16} style={{ color: "var(--color-success)" }} /> : <Link2 size={16} />}
        {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
      </button>
      {copyFailed && (
        <p role="alert" className="mt-1 text-center text-xs text-[var(--color-danger)]">
          คัดลอกไม่สำเร็จ ลองคัดลอกจากแถบที่อยู่แทน
        </p>
      )}
    </div>
  );
}
