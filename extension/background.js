"use strict";

const PLATFORM_API = "https://line-oa.fangwl591021.workers.dev";
const STORAGE_KEYS = Object.freeze({
  token: "linepilot_token",
  user: "linepilot_user",
  expiresAt: "linepilot_expires_at"
});
let knowledgeCache = null;

chrome.runtime.onInstalled.addListener(() => {
  console.log("LINEPILOT 免費版已安裝");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!String(message?.type || "").startsWith("LINEPILOT_")) return false;
  handleMessage(message).then(
    (data) => sendResponse({ ok: true, ...data }),
    (error) => sendResponse({ ok: false, error: error?.message || "LINEPILOT 暫時無法處理" })
  );
  return true;
});

async function handleMessage(message) {
  if (message.type === "LINEPILOT_AUTH_STATUS") {
    const session = await getSession();
    if (!session.token) return { authenticated: false };
    try {
      const data = await api("/api/auth/me", { token: session.token });
      await saveSession({ ...session, user: data.user });
      return { authenticated: true, user: data.user, limits: data.limits };
    } catch (_error) {
      await clearSession();
      return { authenticated: false };
    }
  }
  if (message.type === "LINEPILOT_REGISTER") {
    const data = await api("/api/auth/register", {
      method: "POST",
      body: {
        email: message.email,
        password: message.password,
        displayName: message.displayName,
        companyName: message.companyName
      }
    });
    await saveSession(data);
    knowledgeCache = null;
    return data;
  }
  if (message.type === "LINEPILOT_LOGIN") {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: { email: message.email, password: message.password }
    });
    await saveSession(data);
    knowledgeCache = null;
    return data;
  }
  if (message.type === "LINEPILOT_LOGOUT") {
    const session = await getSession();
    if (session.token) await api("/api/auth/logout", { method: "POST", token: session.token }).catch(() => {});
    await clearSession();
    knowledgeCache = null;
    return { authenticated: false };
  }
  if (message.type === "LINEPILOT_FETCH_KNOWLEDGE") {
    const session = await requireSession();
    if (!knowledgeCache || message.refresh === true) {
      const data = await api("/api/knowledge", { token: session.token });
      knowledgeCache = {
        items: Array.isArray(data.items) ? data.items : [],
        usage: data.usage || { current: 0, limit: 100 },
        fetchedAt: Date.now()
      };
    }
    return knowledgeCache;
  }
  throw new Error("不允許的操作");
}

async function api(path, options = {}) {
  const response = await fetch(PLATFORM_API + path, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || `平台連線失敗 (${response.status})`);
  return data;
}

async function getSession() {
  const values = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  const expiresAt = Number(values[STORAGE_KEYS.expiresAt] || 0);
  if (!values[STORAGE_KEYS.token] || expiresAt <= Date.now()) {
    await clearSession();
    return {};
  }
  return {
    token: values[STORAGE_KEYS.token],
    user: values[STORAGE_KEYS.user] || null,
    expiresAt
  };
}

async function requireSession() {
  const session = await getSession();
  if (!session.token) throw new Error("請先點擊 LINEPILOT 圖示完成免費註冊或登入");
  return session;
}

async function saveSession(data) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.token]: data.token,
    [STORAGE_KEYS.user]: data.user || null,
    [STORAGE_KEYS.expiresAt]: Date.parse(data.expiresAt) || Number(data.expiresAt) || 0
  });
}

async function clearSession() {
  await chrome.storage.local.remove(Object.values(STORAGE_KEYS));
}
