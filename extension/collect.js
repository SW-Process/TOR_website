// Isolated world: parse observed responses, accumulate in chrome.storage.local, update the badge via the worker.
window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data || event.data.mark !== "tor-capture:search") return;
  const rows = TorCapture.parseSearchResults(event.data.body);
  if (rows.length === 0) return;
  chrome.storage.local.get({ collected: {} }, ({ collected }) => {
    for (const r of rows) collected[r.projectCode] = r;
    chrome.storage.local.set({ collected }, () => chrome.runtime.sendMessage({ type: "collected", count: Object.keys(collected).length }));
  });
});
