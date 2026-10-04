import { CLOSING_SOON_HREF } from "@/lib/torSearch";

/**
 * Site-wide keyboard shortcuts — the single list both the key handler
 * (components/KeyboardShortcuts) and the "ปุ่มลัดบนคีย์บอร์ด" pages read, so what's
 * documented is exactly what works.
 *
 * Browser-style chords (Cmd/Ctrl + W, L, 1…) belong to the browser, so these follow
 * GitHub/Gmail: single keys and "G then <key>" sequences, active only while the
 * user isn't typing. Keys are matched by physical position (KeyboardEvent.code),
 * so they also work with the Thai keyboard layout on.
 */

/** Who a shortcut is offered to (vendor-only pages 403 for other roles). */
export type ShortcutAudience = "all" | "signedIn" | "vendor";

export type ShortcutAction =
  | { type: "navigate"; href: string }
  | { type: "focusSearch" }
  | { type: "help" }
  | { type: "escape" }
  /** Clicks the element marked data-shortcut="<target>" on the current page. */
  | { type: "click"; target: "bookmark" | "hide" };

export interface Shortcut {
  id: string;
  /** Key sequence by name: "g" then "h" is ["g", "h"]. "/" "?" "esc" are special. */
  keys: string[];
  label: string;
  audience: ShortcutAudience;
  action: ShortcutAction;
}

export interface ShortcutGroup {
  title: string;
  note?: string;
  shortcuts: Shortcut[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "พื้นฐาน",
    shortcuts: [
      { id: "search", keys: ["/"], label: "ค้นหา TOR", audience: "all", action: { type: "focusSearch" } },
      { id: "help", keys: ["?"], label: "แสดงปุ่มลัดทั้งหมด", audience: "all", action: { type: "help" } },
      { id: "escape", keys: ["esc"], label: "ปิดหน้าต่าง / ออกจากช่องพิมพ์", audience: "all", action: { type: "escape" } },
    ],
  },
  {
    title: "ไปที่หน้า",
    note: "กด G แล้วตามด้วยตัวอักษรภายใน 1.5 วินาที",
    shortcuts: [
      { id: "go-home", keys: ["g", "h"], label: "หน้าแรก", audience: "all", action: { type: "navigate", href: "/" } },
      { id: "go-tor", keys: ["g", "t"], label: "ค้นหา TOR", audience: "all", action: { type: "navigate", href: "/tor" } },
      { id: "go-closing", keys: ["g", "u"], label: "TOR ใกล้ปิดรับ", audience: "all", action: { type: "navigate", href: CLOSING_SOON_HREF } },
      { id: "go-dashboard", keys: ["g", "d"], label: "แดชบอร์ด", audience: "vendor", action: { type: "navigate", href: "/dashboard" } },
      { id: "go-saved", keys: ["g", "b"], label: "รายการที่บันทึก", audience: "vendor", action: { type: "navigate", href: "/bookmarks" } },
      { id: "go-settings", keys: ["g", "s"], label: "ตั้งค่าบัญชี", audience: "signedIn", action: { type: "navigate", href: "/account/settings" } },
      { id: "go-help", keys: ["g", "f"], label: "ศูนย์ช่วยเหลือ", audience: "all", action: { type: "navigate", href: "/help" } },
    ],
  },
  {
    title: "หน้ารายละเอียด TOR",
    shortcuts: [
      { id: "tor-save", keys: ["s"], label: "บันทึก / เลิกบันทึก TOR นี้", audience: "vendor", action: { type: "click", target: "bookmark" } },
      { id: "tor-hide", keys: ["x"], label: "ซ่อน / เลิกซ่อน TOR นี้", audience: "vendor", action: { type: "click", target: "hide" } },
    ],
  },
];

export const ALL_SHORTCUTS = SHORTCUT_GROUPS.flatMap((g) => g.shortcuts);

/** How a key name is drawn on a keycap. */
export const KEY_LABELS: Record<string, string> = { esc: "Esc", "/": "/", "?": "?" };

export function keyLabel(key: string): string {
  return KEY_LABELS[key] ?? key.toUpperCase();
}

export function canUse(audience: ShortcutAudience, role: "vendor" | "admin" | null): boolean {
  return audience === "all" || (audience === "signedIn" ? role !== null : role === "vendor");
}
