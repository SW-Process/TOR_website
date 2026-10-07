const DEFAULT_API = "http://localhost:8000";
const $ = (id) => document.getElementById(id);

// kind: "info" | "success" | "error" | "progress"
function setResult(text, kind = "info") {
  const el = $("result");
  el.textContent = text;
  el.hidden = !text;
  el.className = kind === "info" ? "notice" : `notice notice-${kind}`;
}

let sending = false;

function setSettingsOpen(open) {
  $("settings").hidden = !open;
  $("settingsToggle").setAttribute("aria-expanded", String(open));
}

function renderCount() {
  chrome.storage.local.get({ collected: {} }, ({ collected }) => {
    const n = Object.keys(collected).length;
    $("count").textContent = String(n);
    $("hint").hidden = n !== 0;
    $("send").disabled = n === 0 || sending;
    $("clear").disabled = n === 0;
  });
}

const POLL_MS = 3000;
const POLL_LIMIT = 200; // ~10 minutes
let pollToken = 0;

function ask(msg) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : res || { ok: false, error: "ไม่มีผลตอบกลับ" });
      });
    } catch (e) {
      resolve({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  });
}

// Polls one run until it finishes; a newer poll (or closing the popup) cancels it.
async function pollRun(runId) {
  const token = ++pollToken;
  for (let i = 0; i < POLL_LIMIT; i += 1) {
    const res = await ask({ type: "status", runId });
    if (token !== pollToken) return;
    if (!res.ok) {
      setResult(res.error || "ตรวจสอบสถานะไม่สำเร็จ", "error");
      if (res.fatal) return;
    } else if (res.status !== "running") {
      const kind = res.status === "failed" ? "error" : res.status === "partial" ? "progress" : "success";
      setResult(res.summary || `เสร็จสิ้น (${res.status})`, kind);
      return;
    } else {
      setResult("กำลังประมวลผล…", "progress");
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
    if (token !== pollToken) return;
  }
  setResult("ยังประมวลผลไม่เสร็จ ลองดูผลในหน้าแอดมิน", "progress");
}

$("send").addEventListener("click", async () => {
  sending = true;
  $("send").disabled = true;
  setResult("กำลังส่ง…", "progress");
  const res = await ask({ type: "send" });
  sending = false;
  renderCount();
  if (!res.ok || !res.runId) {
    setResult(res.error || "ส่งไม่สำเร็จ", "error");
    return;
  }
  setResult("ส่งแล้ว กำลังประมวลผล…", "progress");
  pollRun(res.runId);
});

$("clear").addEventListener("click", () => {
  chrome.storage.local.set({ collected: {} }, () => {
    chrome.action.setBadgeText({ text: "" });
    setResult("");
    renderCount();
  });
});

$("settingsToggle").addEventListener("click", () => {
  setSettingsOpen($("settings").hidden);
});

$("save").addEventListener("click", () => {
  let origin;
  try {
    origin = new URL($("apiBase").value.trim()).origin;
  } catch {
    setResult("URL ไม่ถูกต้อง", "error");
    return;
  }
  // Must be called directly from the click (user gesture).
  chrome.permissions.request({ origins: [`${origin}/*`] }, (granted) => {
    if (!granted) {
      setResult("ไม่ได้รับสิทธิ์เข้าถึง " + origin, "error");
      return;
    }
    chrome.storage.sync.set({ apiBase: origin }, () => {
      setSettingsOpen(false);
      setResult("บันทึกแล้ว", "success");
    });
  });
});

chrome.storage.sync.get({ apiBase: DEFAULT_API }, ({ apiBase }) => {
  $("apiBase").value = apiBase;
});
renderCount();
chrome.storage.local.get({ lastRunId: "" }, ({ lastRunId }) => {
  if (lastRunId) pollRun(lastRunId);
});
