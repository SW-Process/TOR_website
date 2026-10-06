const MAX_PER_SEND = 100;
const POLL_MS = 3000;
const POLL_LIMIT = 200; // ~10 minutes

async function apiBase() {
  const { apiBase } = await chrome.storage.sync.get({ apiBase: "http://localhost:8000" });
  return apiBase.replace(/\/$/, "");
}

async function send() {
  const { collected } = await chrome.storage.local.get({ collected: {} });
  const projects = Object.values(collected).slice(0, MAX_PER_SEND);
  if (projects.length === 0) return { ok: false, error: "ยังไม่มีโครงการที่เก็บไว้" };
  const base = await apiBase();
  const res = await fetch(`${base}/api/ingestion/capture`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projects }),
  });
  if (res.status === 401 || res.status === 403) return { ok: false, error: "ต้องล็อกอินเป็นแอดมินในเว็บก่อน" };
  if (!res.ok) return { ok: false, error: `ส่งไม่สำเร็จ (${res.status})` };
  const { runId } = await res.json();
  for (let i = 0; i < POLL_LIMIT; i += 1) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const r = await fetch(`${base}/api/ingestion/runs/${runId}`, { credentials: "include" });
    if (!r.ok) continue;
    const { run } = await r.json();
    if (run.status !== "running") {
      const done = projects.map((p) => p.projectCode);
      const left = Object.fromEntries(Object.entries(collected).filter(([code]) => !done.includes(code)));
      await chrome.storage.local.set({ collected: left });
      updateBadge(Object.keys(left).length);
      return { ok: true, status: run.status, summary: run.outcomeSummary, stats: run.stats };
    }
  }
  return { ok: false, error: "ยังประมวลผลไม่เสร็จ ลองดูผลในหน้าแอดมิน" };
}

function updateBadge(count) {
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === "collected") updateBadge(msg.count);
  if (msg.type === "send") {
    send().then(reply).catch((e) => reply({ ok: false, error: String(e && e.message ? e.message : e) }));
    return true; // async reply
  }
});
chrome.runtime.onStartup.addListener(() => chrome.storage.local.get({ collected: {} }, ({ collected }) => updateBadge(Object.keys(collected).length)));
