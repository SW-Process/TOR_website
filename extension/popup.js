const DEFAULT_API = "http://localhost:8000";
const $ = (id) => document.getElementById(id);

function setResult(text) {
  $("result").textContent = text;
}

function renderCount() {
  chrome.storage.local.get({ collected: {} }, ({ collected }) => {
    $("count").textContent = `เก็บไว้ ${Object.keys(collected).length} โครงการ`;
  });
}

function describe(res) {
  if (!res) return "ไม่มีผลตอบกลับ";
  if (!res.ok) return res.error || "ส่งไม่สำเร็จ";
  return res.summary || `เสร็จสิ้น (${res.status})`;
}

$("send").addEventListener("click", () => {
  $("send").disabled = true;
  setResult("กำลังส่ง…");
  chrome.runtime.sendMessage({ type: "send" }, (res) => {
    $("send").disabled = false;
    setResult(chrome.runtime.lastError ? chrome.runtime.lastError.message : describe(res));
    renderCount();
  });
});

$("clear").addEventListener("click", () => {
  chrome.storage.local.set({ collected: {} }, () => {
    chrome.action.setBadgeText({ text: "" });
    setResult("");
    renderCount();
  });
});

$("save").addEventListener("click", () => {
  let origin;
  try {
    origin = new URL($("apiBase").value.trim()).origin;
  } catch {
    setResult("URL ไม่ถูกต้อง");
    return;
  }
  // Must be called directly from the click (user gesture).
  chrome.permissions.request({ origins: [`${origin}/*`] }, (granted) => {
    if (!granted) {
      setResult("ไม่ได้รับสิทธิ์เข้าถึง " + origin);
      return;
    }
    chrome.storage.sync.set({ apiBase: origin }, () => setResult("บันทึกแล้ว"));
  });
});

chrome.storage.sync.get({ apiBase: DEFAULT_API }, ({ apiBase }) => {
  $("apiBase").value = apiBase;
});
renderCount();
