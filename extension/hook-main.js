// Runs in the page world. Only OBSERVES the page's own search responses and re-posts them;
// it never issues a request itself and never reads the Turnstile token.
(function () {
  const MARK = "tor-capture:search";
  // The page's own request: …/egp-oann10-service/pb/a-egp-allt-project/announcement?…&page=<n> (not a sub-path).
  const isSearch = (url) => {
    try {
      const u = new URL(url, location.href);
      return /\/a-egp-allt-project\/announcement$/.test(u.pathname) && u.searchParams.has("page");
    } catch {
      return false;
    }
  };
  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const p = origFetch.apply(this, args);
    try {
      const url = args[0] instanceof Request ? args[0].url : String(args[0]);
      if (isSearch(url)) {
        p.then((res) => res.clone().json()).then((body) => window.postMessage({ mark: MARK, body }, "*")).catch(() => {});
      }
    } catch {}
    return p;
  };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try {
      if (isSearch(String(url))) {
        this.addEventListener("load", () => {
          try {
            const body = this.responseType === "json" ? this.response : JSON.parse(this.responseText);
            window.postMessage({ mark: MARK, body }, "*");
          } catch {}
        });
      }
    } catch {}
    return open.call(this, method, url, ...rest);
  };
})();
