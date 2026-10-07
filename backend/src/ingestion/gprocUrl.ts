const DEFAULT_BASE = "https://process5.gprocurement.go.th";

/** The process5 page that finds the project (its search page, keyword = the project number); the user presses "ดูข้อมูล". */
export function gprocProjectUrl(projectCode: string, base: string = process.env.GPROC_BASE_URL ?? DEFAULT_BASE): string {
  return `${base.replace(/\/$/, "")}/egp-agpc01-web/announcement?keywordSearch=${encodeURIComponent(projectCode)}`;
}
