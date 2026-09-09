/**
 * Base URL of the Express backend. Set NEXT_PUBLIC_API_BASE_URL in the
 * environment (compose sets it for the docker stack); falls back to the local
 * dev port.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

/** `fetch` against the backend, always sending the session cookie. */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, { ...init, credentials: "include" });
}
