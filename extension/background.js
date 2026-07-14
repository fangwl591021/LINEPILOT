"use strict";

const LINE_COPILOT_MLM_KNOWLEDGE_URL =
  "https://raw.githubusercontent.com/fangwl591021/MLM/main/data/knowledge-base.json";
let lineCopilotKnowledgeCache = null;

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
