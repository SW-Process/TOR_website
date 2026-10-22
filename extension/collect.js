// Isolated world: parse observed responses, accumulate in chrome.storage.local, update the badge via the worker.
// Writes are chained so two messages cannot interleave their read-modify-write.
let queue = Promise.resolve();

async function add(rows) {
  const { collected } = await chrome.storage.local.get({ collected: {} });
  for (const r of rows) collected[r.projectCode] = r;
  await chrome.storage.local.set({ collected });
  await chrome.runtime.sendMessage({ type: "collected", count: Object.keys(collected).length });
}

// Only our own messages from hook-main.js count; see TorCapture.isCaptureMessage (ASVS 3.5.5).
window.addEventListener("message", (event) => {
  if (!TorCapture.isCaptureMessage(event, window)) return;
  const rows = TorCapture.parseSearchResults(event.data.body);
  if (rows.length === 0) return;
  // Errors (e.g. extension context invalidated after a reload) must not break the chain or the page.
  queue = queue.then(() => add(rows)).catch(() => {});
});
