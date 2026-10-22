import { getReauthHandler, type ReauthMethod } from "./reauth";

/**
 * Base URL of the Express backend. Set NEXT_PUBLIC_API_BASE_URL in the
 * environment (compose sets it for the docker stack); falls back to the local
 * dev port.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

/** Fired on `window` when the backend says the session is gone (expired, signed out elsewhere). */
export const SESSION_EXPIRED_EVENT = "tor:session-expired";

/**
 * The backend ends a session after 30 minutes without activity (ASVS 7.3.1). Chat and
 * status polling would otherwise keep an unattended tab signed in forever, so a request
 * made with no keyboard, mouse or touch input in the last minute is sent as background
 * (`X-Background-Request: 1`) and doesn't count as activity.
 */
const ACTIVE_WINDOW_MS = 60 * 1000;
let lastInputAt = Date.now();
if (typeof window !== "undefined") {
  const mark = () => {
    lastInputAt = Date.now();
  };
  for (const type of ["pointerdown", "keydown", "wheel", "touchstart"]) {
    window.addEventListener(type, mark, { passive: true, capture: true });
  }
}

/**
 * `fetch` against the backend, always sending the session cookie. A request refused with
 * `reauth_required` is retried once after the user confirms it's them (lib/reauth).
 */
export async function apiFetch(path: string, init?: RequestInit, retried = false): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (typeof window !== "undefined" && Date.now() - lastInputAt > ACTIVE_WINDOW_MS) {
    headers.set("X-Background-Request", "1");
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: "include" });
  // Only a lost session: a wrong password or code is a 401 too, with another code.
  if (res.status === 401 && typeof window !== "undefined") {
    const body = (await res.clone().json().catch(() => ({}))) as { code?: string; methods?: ReauthMethod[] };
    if (body.code === "session_invalid") window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    const confirm = getReauthHandler();
    if (body.code === "reauth_required" && confirm && !retried && (await confirm(body.methods ?? ["password"]))) {
      return apiFetch(path, init, true);
    }
  }
  return res;
}
