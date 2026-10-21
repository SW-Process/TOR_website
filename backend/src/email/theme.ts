/**
 * The site's own colors (frontend/src/app/globals.css) and a font stack with Thai
 * fallbacks, shared by every branded email so they all look like the web app.
 */
export const COLOR_INK = "#221a18";
export const COLOR_TEXT_MUTED = "#6b5a56";
export const COLOR_ROSE_DARK = "#c23e60";
export const COLOR_BLUSH_SOFT = "#fdf0ee";
export const COLOR_BORDER = "#f0e2e0";
export const FONT_STACK = `-apple-system, "Segoe UI", "Noto Sans Thai", "Leelawadee UI", Tahoma, Arial, sans-serif`;

/** Escape text from the database (TOR titles, agency names) before it goes into email HTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
