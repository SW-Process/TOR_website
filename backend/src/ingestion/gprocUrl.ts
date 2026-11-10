const DEFAULT_BASE = "https://process5.gprocurement.go.th";

/** The process5 page that finds the project (its search page, keyword = the project number); the user presses "ดูข้อมูล". */
export function gprocProjectUrl(projectCode: string, base: string = process.env.GPROC_BASE_URL ?? DEFAULT_BASE): string {
  return `${base.replace(/\/$/, "")}/egp-agpc01-web/announcement?keywordSearch=${encodeURIComponent(projectCode)}`;
}

const PROCESS3_BASE = "https://process3.gprocurement.go.th";

/**
 * process5 method id for "ประกาศเชิญชวนทั่วไป" (mostly consultancy hires). Its invitation is not a PDF on
 * process5: the "ดูข้อมูล" icon opens an HTML page on the old e-GP (process3), with no TOR attached.
 */
export const HTML_ANNOUNCEMENT_METHOD_ID = "20";

/** The old e-GP (process3) page that shows such a project's invitation as HTML. Opens only in a browser. */
export function gprocHtmlAnnouncementUrl(projectCode: string): string {
  const q = new URLSearchParams({ pid: projectCode, servlet: "gojsp", proc_id: "ShowHTMLFile", processFlows: "Procure" });
  return `${PROCESS3_BASE}/egp2procmainWeb/jsp/procsearch.sch?${q}`;
}
