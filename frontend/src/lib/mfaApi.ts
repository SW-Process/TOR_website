import { apiFetch } from "./api";

/** Two-step verification (TOTP) settings calls; each may first open the "confirm it's you" dialog. */

export interface MfaSetup {
  secret: string;
  otpauthUrl: string;
  qrSvg: string;
}

export type MfaResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function post<T>(path: string, payload: object = {}): Promise<MfaResult<T>> {
  let res: Response;
  try {
    res = await apiFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  } catch {
    return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่" };
  }
  const body = (await res.json().catch(() => ({}))) as T & { code?: string; message?: string };
  if (res.ok) return { ok: true, data: body };
  if (res.status === 429) return { ok: false, error: "ลองหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่" };
  if (body.code === "reauth_required") return { ok: false, error: "กรุณายืนยันตัวตนก่อนทำรายการนี้" };
  if (body.code === "bad_code") return { ok: false, error: "รหัสไม่ถูกต้อง หรือหมดเวลาตั้งค่าแล้ว กรุณาลองรหัสใหม่" };
  if (res.status === 403) return { ok: false, error: "บัญชีผู้ดูแลระบบต้องเปิดการยืนยันตัวตนสองขั้นตอนไว้เสมอ" };
  return { ok: false, error: "เกิดข้อผิดพลาด กรุณาลองใหม่" };
}

export const startMfaSetup = () => post<MfaSetup>("/api/auth/mfa/setup");
export const enableMfa = (code: string) => post<{ recoveryCodes: string[] }>("/api/auth/mfa/enable", { code: code.replace(/\s/g, "") });
export const disableMfa = () => post<object>("/api/auth/mfa/disable");
export const regenerateRecoveryCodes = () => post<{ recoveryCodes: string[] }>("/api/auth/mfa/recovery-codes");
