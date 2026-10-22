import { NextResponse, type NextRequest } from "next/server";

/**
 * Content-Security-Policy with a fresh nonce for every page (ASVS 3.4.3, L2 and L3):
 * - scripts run only if they carry this response's nonce ('strict-dynamic' lets those
 *   load Next.js's own chunks), so an injected <script> or inline handler doesn't run;
 * - object-src 'none' and base-uri 'none', as ASVS asks for at minimum;
 * - the page may only talk to itself and the API (connect-src), and load images from
 *   itself, the API (avatars) and data: URLs (the MFA QR code);
 * - inline style *attributes* stay allowed: the UI sets a few (animation delays), and
 *   style injection can't run code.
 * Next.js reads the nonce from this request header and adds it to every script it
 * renders; the root layout reads headers(), which renders every page per request.
 */
const API_ORIGIN = new URL(process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000").origin;

export function contentSecurityPolicy(nonce: string, dev = process.env.NODE_ENV === "development"): string {
  return [
    "default-src 'self'",
    // React uses eval() for better error stacks in development only.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${API_ORIGIN}`,
    "font-src 'self'",
    `connect-src 'self' ${API_ORIGIN}${dev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  // 128 random bits (ASVS 11.5.1); a UUID would carry only 122.
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const csp = contentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  // Pages can show account details: never cache them in shared caches or the back/forward cache (ASVS 14.3.2).
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: static files and images don't run scripts.
      source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
