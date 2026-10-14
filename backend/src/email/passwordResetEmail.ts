/**
 * The "forgot password" email, in the site's own voice and colors (see
 * frontend/src/app/globals.css) rather than a plain-text link. Inline styles and a
 * table layout only — no webfonts or external images — so it renders consistently
 * across mail clients, Outlook included.
 */

const COLOR_INK = "#221a18";
const COLOR_TEXT_MUTED = "#6b5a56";
const COLOR_ROSE_DARK = "#c23e60";
const COLOR_BLUSH_SOFT = "#fdf0ee";
const COLOR_BORDER = "#f0e2e0";
const FONT_STACK = `-apple-system, "Segoe UI", "Noto Sans Thai", "Leelawadee UI", Tahoma, Arial, sans-serif`;

export interface PasswordResetEmail {
  subject: string;
  text: string;
  html: string;
}

export function buildPasswordResetEmail(link: string): PasswordResetEmail {
  const subject = "ตั้งรหัสผ่านใหม่สำหรับบัญชี TOR Checker";

  const text =
    `มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีนี้\n\n` +
    `ตั้งรหัสผ่านใหม่ได้ที่ลิงก์นี้ (ใช้ได้ภายใน 1 ชั่วโมง):\n${link}\n\n` +
    `หากคุณไม่ได้ขอ สามารถเพิกเฉยต่ออีเมลนี้ได้ ลิงก์จะไม่ถูกใช้งานหากไม่ได้กดเปิด`;

  const html = `<!doctype html>
<html lang="th">
  <body style="margin:0;padding:32px 16px;background-color:${COLOR_BLUSH_SOFT};font-family:${FONT_STACK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0"
            style="max-width:480px;width:100%;background-color:#ffffff;border:1px solid ${COLOR_BORDER};border-radius:24px;">
            <tr>
              <td style="padding:36px 32px;">
                <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.08em;color:${COLOR_ROSE_DARK};text-transform:uppercase;">
                  TOR Checker
                </p>
                <h1 style="margin:14px 0 0;font-size:22px;font-weight:800;color:${COLOR_INK};">
                  ตั้งรหัสผ่านใหม่
                </h1>
                <p style="margin:14px 0 0;font-size:14px;line-height:1.7;color:${COLOR_INK};">
                  มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีนี้ กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่
                  ลิงก์นี้ใช้ได้ภายใน 1 ชั่วโมง
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;">
                  <tr>
                    <td align="center" bgcolor="${COLOR_INK}" style="border-radius:999px;">
                      <a href="${link}"
                        style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">
                        ตั้งรหัสผ่านใหม่
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:26px 0 0;font-size:12px;line-height:1.7;color:${COLOR_TEXT_MUTED};">
                  หากปุ่มด้านบนกดไม่ได้ ให้คัดลอกลิงก์นี้ไปเปิดในเบราว์เซอร์:<br />
                  <a href="${link}" style="color:${COLOR_ROSE_DARK};word-break:break-all;">${link}</a>
                </p>
                <p style="margin:20px 0 0;font-size:12px;line-height:1.7;color:${COLOR_TEXT_MUTED};">
                  หากคุณไม่ได้ขอตั้งรหัสผ่านใหม่ สามารถเพิกเฉยต่ออีเมลนี้ได้
                  ลิงก์จะไม่ถูกใช้งานหากไม่ได้กดเปิด
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;border-top:1px solid ${COLOR_BORDER};">
                <p style="margin:0;font-size:11px;line-height:1.6;color:${COLOR_TEXT_MUTED};">
                  TOR Checker — ตรวจสอบความเป็นธรรมของประกาศจัดซื้อจัดจ้างซอฟต์แวร์ กทม.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}
