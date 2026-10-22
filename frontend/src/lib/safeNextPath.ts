/**
 * Where to go after signing in. `?next=` comes from the URL, so anyone can craft a
 * login link with it; only a path on this site is followed, never another origin
 * (`https://evil.com`, protocol-relative `//evil.com`, backslash tricks, `javascript:`),
 * so the login pages can't be used as an open redirect.
 */
export function safeNextPath(raw: string | null, fallback = "/dashboard"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
