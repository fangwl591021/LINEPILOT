"use strict";

const LINE_COPILOT_MLM_KNOWLEDGE_URL =
  "https://raw.githubusercontent.com/fangwl591021/MLM/main/data/knowledge-base.json";
let lineCopilotKnowledgeCache = null;
const LINE_COPILOT_MLM_API_BASE = "https://mlm.fangwl591021.workers.dev";

chrome.runtime.onInstalled.addListener(() => {
  console.log("LINE COPILOT installed");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "LINE_COPILOT_FETCH_MLM_KNOWLEDGE") return false;

  const requestedUrl = String(message.url || "");
  if (requestedUrl !== LINE_COPILOT_MLM_KNOWLEDGE_URL) {
    sendResponse({ ok: false, error: "不允許的知識庫網址" });
    return false;
  }

  (async () => {
    try {
      if (!lineCopilotKnowledgeCache) {
        const response = await fetch(LINE_COPILOT_MLM_KNOWLEDGE_URL, {
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer"
        });
        if (!response.ok) throw new Error("MLM knowledge HTTP " + response.status);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error("MLM knowledge format is invalid");
        lineCopilotKnowledgeCache = data;
      }
      sendResponse({ ok: true, items: lineCopilotKnowledgeCache });
    } catch (_error) {
      sendResponse({ ok: false, error: "無法載入 MLM 知識庫" });
    }
  })();
  return true;
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!["LINE_COPILOT_MLM_LOGIN", "LINE_COPILOT_MLM_REQUEST"].includes(message?.type)) return false;

  (async () => {
    try {
      if (message.type === "LINE_COPILOT_MLM_LOGIN") {
        const response = await fetch(`${LINE_COPILOT_MLM_API_BASE}/api/auth/extension-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: String(message.username || ""), password: String(message.password || "") }),
          cache: "no-store",
          credentials: "omit",
          redirect: "error",
          referrerPolicy: "no-referrer"
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status !== "success" || !String(data.token || "").startsWith("lcx1.")) {
          throw new Error(data.message || `MLM 登入失敗 (${response.status})`);
        }
        sendResponse({ ok: true, data });
        return;
      }

      const token = String(message.token || "");
      if (!token.startsWith("lcx1.")) throw new Error("MLM 短效登入已失效，請重新登入");
      const method = String(message.method || "GET").toUpperCase();
      const requestedPath = String(message.path || "");
      const target = new URL(requestedPath, LINE_COPILOT_MLM_API_BASE);
      if (target.origin !== LINE_COPILOT_MLM_API_BASE) throw new Error("不允許的 MLM API 網址");
      const allowed =
        (method === "GET" && ["/api/copilot/customer", "/admin/points/ledger"].includes(target.pathname)) ||
        (method === "POST" && ["/admin/points/grant", "/admin/points/deduct"].includes(target.pathname));
      if (!allowed) throw new Error("不允許的 MLM API 操作");
      const options = {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer"
      };
      if (method === "POST") options.body = JSON.stringify(message.body || {});
      const response = await fetch(target.href, options);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.status === "error" || data.success === false) {
        throw new Error(`${data.message || "MLM API 呼叫失敗"} (${response.status})`);
      }
      sendResponse({ ok: true, data });
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || "MLM API 呼叫失敗" });
    }
  })();
  return true;
});
