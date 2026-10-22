/**
 * A Content-Disposition header value for a file name we didn't choose (ASVS 5.4.1,
 * 5.4.2): e-GP file names are Thai, and could hold quotes, slashes or line breaks. Per
 * RFC 6266 the header carries
 * - `filename="…"`: a plain-ASCII fallback with anything risky replaced by `_`;
 * - `filename*=UTF-8''…`: the real name, percent-encoded (RFC 8187), for every modern browser.
 * Path parts are dropped, so a name can't point outside the download folder.
 */
export function contentDisposition(type: "inline" | "attachment", rawName: string, fallback = "download"): string {
  const base = (rawName.split(/[\\/]/).pop() ?? "")
    // control characters (incl. CR/LF, which would split the header) and bidi overrides
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
    .trim()
    .slice(0, 200);
  const name = base || fallback;
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\%;]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*!]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
