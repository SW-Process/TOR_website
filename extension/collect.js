// Isolated world: parse observed responses, accumulate in chrome.storage.local, update the badge via the worker.
// Writes are chained so two messages cannot interleave their read-modify-write.
let queue = Promise.resolve();

async function add(rows) {
  const { collected } = await chrome.storage.local.get({ collected: {} });
  for (const r of rows) collected[r.projectCode] = r;
  await chrome.storage.local.set({ collected });
  await chrome.runtime.sendMessage({ type: "collected", count: Object.keys(collected).length });
}

window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data || event.data.mark !== "tor-capture:search") return;
  const rows = TorCapture.parseSearchResults(event.data.body);
  if (rows.length === 0) return;
  // Errors (e.g. extension context invalidated after a reload) must not break the chain or the page.
  queue = queue.then(() => add(rows)).catch(() => {});
});
