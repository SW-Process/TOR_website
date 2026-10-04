/**
 * Just enough User-Agent parsing to label a session ("Safari บน macOS"). Not a full
 * parser — unknown agents fall back to null fields, which the UI shows generically.
 */
export type DeviceType = "desktop" | "mobile" | "tablet";

export interface DeviceInfo {
  type: DeviceType;
  browser: string | null;
  os: string | null;
}

/** First match wins, so more specific tokens come before the ones they contain. */
const BROWSERS: [RegExp, string][] = [
  [/\bEdgA?\//, "Edge"],
  [/\bOPR\//, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bLine\//, "LINE"],
  [/\bFBAN|FBAV\b/, "Facebook"],
  [/\b(?:Firefox|FxiOS)\//, "Firefox"],
  [/\bCriOS\//, "Chrome"],
  [/\bChrome\//, "Chrome"],
  [/\bVersion\/[\d.]+.*Safari\//, "Safari"],
];

const OSES: [RegExp, string][] = [
  [/\biPad\b/, "iPadOS"],
  [/\b(?:iPhone|iPod)\b/, "iOS"],
  [/\bAndroid\b/, "Android"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bWindows\b/, "Windows"],
  [/\bLinux\b/, "Linux"],
];

export function parseUserAgent(ua: string | null | undefined): DeviceInfo {
  const s = ua ?? "";
  const browser = BROWSERS.find(([re]) => re.test(s))?.[1] ?? null;
  const os = OSES.find(([re]) => re.test(s))?.[1] ?? null;
  const type: DeviceType = /\biPad\b|\bTablet\b|Android(?!.*Mobile)/.test(s)
    ? "tablet"
    : /\bMobi|\biPhone\b|\biPod\b/.test(s)
      ? "mobile"
      : "desktop";
  return { type, browser, os };
}
