// Pure parser for the process5 search response. Loaded as a classic script in the extension and by `node --test`.
(function (root) {
  function parseSearchResults(body) {
    try {
      const data = body && typeof body === "object" ? body.data : null;
      if (!Array.isArray(data)) return [];
      const out = [];
      for (const row of data) {
        if (!row || typeof row !== "object") continue;
        const id = typeof row.projectId === "string" ? row.projectId : "";
        if (!/^\d{11}$/.test(id)) continue;
        out.push({
          projectCode: id,
          title: typeof row.projectName === "string" ? row.projectName.trim().slice(0, 200) : "",
          agency: typeof row.deptSubName === "string" ? row.deptSubName.trim().slice(0, 100) : "",
        });
      }
      return out;
    } catch {
      return [];
    }
  }
  const PAGE_ORIGIN = "https://process5.gprocurement.go.th";
  const MARK = "tor-capture:search";

  /**
   * Whether a window message is one of ours from hook-main.js (ASVS 3.5.5): sent by this
   * very window, from the e-GP origin, with our mark and an object body. Anything else,
   * from another frame, window or site, or shaped differently, is ignored.
   */
  function isCaptureMessage(event, self) {
    if (!event || event.source !== self || event.origin !== PAGE_ORIGIN) return false;
    const data = event.data;
    return !!data && typeof data === "object" && data.mark === MARK && !!data.body && typeof data.body === "object";
  }

  const api = { parseSearchResults, isCaptureMessage };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TorCapture = Object.assign(root.TorCapture || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this);
