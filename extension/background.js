const MAX_PER_SEND = 100;

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
  if (res.status === 409) return { ok: false, error: "มีการส่งข้อมูลที่กำลังประมวลผลอยู่ รอให้เสร็จก่อน" };
  if (!res.ok) return { ok: false, error: `ส่งไม่สำเร็จ (${res.status})` };
  let runId;
  try {
    ({ runId } = await res.json());
  } catch {
    runId = undefined;
  }
  if (!runId) return { ok: false, error: "ส่งแล้ว แต่ไม่ได้รับรหัสการประมวลผล ลองดูผลในหน้าแอดมิน" };
  // Re-read at removal time and delete only the sent codes, so rows collected meanwhile are kept.
  const fresh = (await chrome.storage.local.get({ collected: {} })).collected;
  for (const p of projects) delete fresh[p.projectCode];
  await chrome.storage.local.set({ collected: fresh, lastRunId: runId });
  updateBadge(Object.keys(fresh).length);
  return { ok: true, runId };
}

// One status fetch; the popup does the polling (the worker may be killed during a long wait).
async function status(runId) {
  if (!runId || typeof runId !== "string") return { ok: false, error: "ไม่มีรหัสการประมวลผล" };
  const base = await apiBase();
  const r = await fetch(`${base}/api/ingestion/runs/${encodeURIComponent(runId)}`, { credentials: "include" });
  if (!r.ok) return { ok: false, fatal: r.status >= 400 && r.status < 500, error: `ตรวจสอบสถานะไม่สำเร็จ (${r.status})` };
  let run;
  try {
    ({ run } = await r.json());
  } catch {
    run = undefined;
  }
  if (!run || typeof run !== "object") return { ok: false, error: "ผลตอบกลับไม่ถูกต้อง" };
  return { ok: true, status: run.status, summary: run.outcomeSummary, stats: run.stats };
}

function updateBadge(count) {
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === "collected") updateBadge(msg.count);
  if (msg.type === "status") {
    status(msg.runId).then(reply).catch((e) => reply({ ok: false, error: String(e && e.message ? e.message : e) }));
    return true;
  }
  if (msg.type === "send") {
    send().then(reply).catch((e) => reply({ ok: false, error: String(e && e.message ? e.message : e) }));
    return true; // async reply
  }
});
const restoreBadge = () => chrome.storage.local.get({ collected: {} }, ({ collected }) => updateBadge(Object.keys(collected).length));
chrome.runtime.onStartup.addListener(restoreBadge);
chrome.runtime.onInstalled.addListener(restoreBadge);
