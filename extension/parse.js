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
          title: typeof row.projectName === "string" ? row.projectName.trim() : "",
          agency: typeof row.deptSubName === "string" ? row.deptSubName.trim() : "",
        });
      }
      return out;
    } catch {
      return [];
    }
  }
  const api = { parseSearchResults };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TorCapture = Object.assign(root.TorCapture || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this);
