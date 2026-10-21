import { COLOR_BLUSH_SOFT, COLOR_BORDER, COLOR_INK, COLOR_ROSE_DARK, COLOR_TEXT_MUTED, FONT_STACK, escapeHtml } from "./theme";

/**
 * The "new TORs match you" digest (FR-29): one email per vendor per enrichment run,
 * listing every TOR that run matched to their profile or a saved search. Same look
 * as the password-reset email — inline styles and a table layout only.
 */

export interface MatchDigestItem {
  title: string;
  agency?: string | null;
  budget?: number | null;
  link: string;
  /** Why it matched, already worded for the reader, e.g. "ตรงกับโปรไฟล์ของคุณ". */
  reasons: string[];
}

export interface MatchDigestInput {
  items: MatchDigestItem[];
  /** Matches left out of `items` to keep the email short; summarized as "and N more". */
  moreCount: number;
  dashboardLink: string;
}

export interface MatchDigestEmail {
  subject: string;
  text: string;
  html: string;
}

function formatBudget(budget: number | null | undefined): string | null {
  if (budget == null) return null;
  return `งบประมาณ ${budget.toLocaleString("en-US", { maximumFractionDigits: 0 })} บาท`;
}

function metaLine(item: MatchDigestItem): string {
  return [item.agency, formatBudget(item.budget)].filter(Boolean).join(" · ");
}

export function buildMatchDigestEmail({ items, moreCount, dashboardLink }: MatchDigestInput): MatchDigestEmail {
  const total = items.length + moreCount;
  const subject = `มี TOR ใหม่ ${total} รายการที่ตรงกับคุณ`;
  const intro = `จากการอัปเดตข้อมูลล่าสุด มี TOR ใหม่ ${total} รายการที่ตรงกับโปรไฟล์หรือการค้นหาที่คุณบันทึกไว้`;
  const more = moreCount > 0 ? `และอีก ${moreCount} รายการ ดูทั้งหมดได้ในแดชบอร์ดของคุณ` : null;

  const text =
    `${intro}\n\n` +
    items
      .map((item) => {
        const meta = metaLine(item);
        return [`- ${item.title}`, meta && `  ${meta}`, `  ${item.reasons.join(", ")}`, `  ${item.link}`]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n") +
    (more ? `\n\n${more}` : "") +
    `\n\nดู TOR ทั้งหมดที่ตรงกับคุณ: ${dashboardLink}`;

  const rows = items
    .map((item) => {
      const meta = metaLine(item);
      const chips = item.reasons
        .map(
          (r) =>
            `<span style="display:inline-block;margin:6px 6px 0 0;padding:3px 10px;font-size:11px;font-weight:600;color:${COLOR_ROSE_DARK};background-color:${COLOR_BLUSH_SOFT};border-radius:999px;">${escapeHtml(r)}</span>`
        )
        .join("");
      return `
                <tr>
                  <td style="padding:16px 0;border-top:1px solid ${COLOR_BORDER};">
                    <a href="${escapeHtml(item.link)}"
                      style="font-size:15px;font-weight:700;line-height:1.5;color:${COLOR_INK};text-decoration:none;">${escapeHtml(item.title)}</a>
                    ${meta ? `<p style="margin:4px 0 0;font-size:12px;line-height:1.6;color:${COLOR_TEXT_MUTED};">${escapeHtml(meta)}</p>` : ""}
                    <div>${chips}</div>
                  </td>
                </tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="th">
  <body style="margin:0;padding:32px 16px;background-color:${COLOR_BLUSH_SOFT};font-family:${FONT_STACK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"
            style="max-width:560px;width:100%;background-color:#ffffff;border:1px solid ${COLOR_BORDER};border-radius:24px;">
            <tr>
              <td style="padding:36px 32px 12px;">
                <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.08em;color:${COLOR_ROSE_DARK};text-transform:uppercase;">
                  TOR Checker
                </p>
                <h1 style="margin:14px 0 0;font-size:22px;font-weight:800;color:${COLOR_INK};">
                  TOR ใหม่ที่ตรงกับคุณ
                </h1>
                <p style="margin:14px 0 20px;font-size:14px;line-height:1.7;color:${COLOR_INK};">
                  ${escapeHtml(intro)}
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}
                </table>
                ${more ? `<p style="margin:4px 0 0;padding-top:16px;border-top:1px solid ${COLOR_BORDER};font-size:13px;color:${COLOR_TEXT_MUTED};">${escapeHtml(more)}</p>` : ""}
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 24px;">
                  <tr>
                    <td align="center" bgcolor="${COLOR_INK}" style="border-radius:999px;">
                      <a href="${escapeHtml(dashboardLink)}"
                        style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">
                        ดู TOR ทั้งหมดที่ตรงกับคุณ
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;border-top:1px solid ${COLOR_BORDER};">
                <p style="margin:0;font-size:11px;line-height:1.6;color:${COLOR_TEXT_MUTED};">
                  คุณได้รับอีเมลนี้เพราะ TOR เหล่านี้ตรงกับโปรไฟล์หรือการค้นหาที่บันทึกไว้ในบัญชี TOR Checker ของคุณ
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
