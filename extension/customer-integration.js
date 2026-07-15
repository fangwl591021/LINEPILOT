(() => {
  "use strict";

  const EMPTY_VALUE = "尚未偵測到";
  const runtime = {
    root: null,
    getLatestChat: null,
    token: "",
    expiresAt: 0,
    profile: null,
    chat: null,
    data: null,
    loadingUid: "",
    requestSequence: 0
  };

  const get = (id) => runtime.root?.querySelector(`#${id}`) || null;
  const setText = (id, value, fallback = EMPTY_VALUE) => {
    const element = get(id);
    if (element) element.textContent = value || fallback;
  };
  const setHidden = (id, hidden) => {
    const element = get(id);
    if (element) element.hidden = Boolean(hidden);
  };

  function createSectionMarkup() {
    return `
      <section id="line-copilot-customer-data-section" class="line-copilot-customer-data-section" aria-labelledby="line-copilot-customer-data-heading">
        <div class="line-copilot-section-heading-row"><h2 id="line-copilot-customer-data-heading" class="line-copilot-section-title">客戶資料與 K 點</h2><button id="line-copilot-customer-refresh" class="line-copilot-ai-link-button" type="button" hidden>重新整理</button></div>
        <div id="line-copilot-mlm-login" class="line-copilot-mlm-login">
          <p class="line-copilot-customer-data-note">登入 MLM 客服帳號後，可依目前 LINE UID 讀取 K 點。帳密與短效 Token 不會儲存。</p>
          <label class="line-copilot-customer-field"><span>帳號</span><input id="line-copilot-mlm-username" class="line-copilot-customer-input" type="text" autocomplete="username" placeholder="客服帳號"></label>
          <label class="line-copilot-customer-field"><span>密碼</span><input id="line-copilot-mlm-password" class="line-copilot-customer-input" type="password" autocomplete="current-password" placeholder="客服密碼"></label>
          <button id="line-copilot-mlm-login-button" class="line-copilot-primary-button" type="button">登入並讀取 K 點</button>
        </div>
        <div id="line-copilot-mlm-session" class="line-copilot-mlm-session" hidden><span id="line-copilot-mlm-session-label">已登入</span><button id="line-copilot-mlm-logout" class="line-copilot-ai-link-button" type="button">登出</button></div>
        <p id="line-copilot-customer-data-status" class="line-copilot-customer-data-status" role="status" aria-live="polite">請先登入 MLM</p>
        <div id="line-copilot-point-content" hidden>
          <div id="line-copilot-point-balances" class="line-copilot-point-balances"></div>
          <div class="line-copilot-point-form">
            <label class="line-copilot-customer-field"><span>操作來源</span><select id="line-copilot-point-source" class="line-copilot-customer-input"><option value="oa1">康立智能</option><option value="oa2">康立全球（只能扣點）</option></select></label>
            <label class="line-copilot-customer-field"><span>K 點數量</span><input id="line-copilot-point-amount" class="line-copilot-customer-input" type="number" min="1" step="1" value="1"></label>
            <label class="line-copilot-customer-field line-copilot-point-note-field"><span>操作原因</span><input id="line-copilot-point-note" class="line-copilot-customer-input" type="text" maxlength="160" placeholder="必填，將寫入操作紀錄"></label>
          </div>
          <div class="line-copilot-point-actions"><button id="line-copilot-point-grant" class="line-copilot-primary-button" type="button">贈 K 點</button><button id="line-copilot-point-deduct" class="line-copilot-secondary-button line-copilot-point-deduct" type="button">扣 K 點</button></div>
          <p class="line-copilot-customer-data-note">所有異動都需人工確認；身分未對應時不開放操作。</p>
        </div>
      </section>`;
  }

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) { reject(new Error(error.message || "Extension 通訊失敗")); return; }
        if (!response?.ok) { reject(new Error(response?.error || "MLM API 呼叫失敗")); return; }
        resolve(response);
      });
    });
  }

  function validLineUid(value) {
    return /^U[a-zA-Z0-9_-]{20,}$/.test(String(value || ""));
  }

  function renderAvatar(url, name) {
    const image = get("line-copilot-summary-avatar");
    const fallback = get("line-copilot-summary-avatar-fallback");
    const safeUrl = /^https:\/\//i.test(String(url || "")) ? String(url) : "";
    if (image) {
      image.hidden = !safeUrl;
      if (safeUrl && image.src !== safeUrl) image.src = safeUrl;
      if (!safeUrl) image.removeAttribute("src");
      image.alt = name ? `${name} 頭貼` : "LINE 客戶頭貼";
    }
    if (fallback) {
      fallback.hidden = Boolean(safeUrl);
      fallback.textContent = String(name || "客").trim().slice(0, 1) || "客";
    }
  }

  function currentCustomer() {
    return runtime.data?.customer || {};
  }

  function renderIdentity() {
    const chat = runtime.chat || {};
    const customer = currentCustomer();
    const uid = validLineUid(chat.conversationId) ? chat.conversationId : "";
    const name = customer.displayName || (chat.contactName !== EMPTY_VALUE ? chat.contactName : "");
    const avatarUrl = customer.pictureUrl || chat.contactAvatarUrl || "";
    setText("line-copilot-summary-name", name, "尚未偵測到");
    setText("line-copilot-summary-uid", uid, "尚未取得 LINE UID");
    setText("line-copilot-conversation-id", uid || chat.conversationId, EMPTY_VALUE);
    renderAvatar(avatarUrl, name);
  }

  function renderAuth() {
    const loggedIn = Boolean(runtime.token && runtime.expiresAt > Date.now());
    setHidden("line-copilot-mlm-login", loggedIn);
    setHidden("line-copilot-mlm-session", !loggedIn);
    setHidden("line-copilot-customer-refresh", !loggedIn);
    setText("line-copilot-mlm-session-label", loggedIn ? `MLM：${runtime.profile?.displayName || "已登入"}` : "");
    if (!loggedIn) {
      setHidden("line-copilot-point-content", true);
      setText("line-copilot-customer-data-status", "請先登入 MLM");
    }
  }

  function sourceUid(source) {
    const resolved = runtime.data?.resolved || {};
    const mapped = resolved.channel_line_user_ids || {};
    if (mapped[source]) return mapped[source];
    const row = (runtime.data?.balances || []).find((item) => item.channel_key === source && item.line_user_id);
    if (row?.line_user_id) return row.line_user_id;
    if (["exact_chat_uid", "exact_wetw"].includes(resolved.source) && validLineUid(runtime.chat?.conversationId)) return runtime.chat.conversationId;
    return "";
  }

  function sourceTotal(source) {
    return (runtime.data?.balances || []).filter((item) => item.channel_key === source).reduce((sum, item) => sum + Number(item.balance || 0), 0);
  }

  function formatPoint(value) {
    const number = Number(value || 0);
    return Number.isInteger(number) ? String(number) : number.toFixed(2);
  }

  function renderPoints() {
    renderIdentity();
    renderAuth();
    if (!runtime.token || !runtime.data) {
      setHidden("line-copilot-point-content", true);
      return;
    }
    const uid = runtime.chat?.conversationId;
    const balances = runtime.data.balances || [];
    const resolved = runtime.data.resolved || {};
    const container = get("line-copilot-point-balances");
    if (container) {
      container.replaceChildren();
      [["oa1", "康立智能"], ["oa2", "康立全球"]].forEach(([key, label]) => {
        const card = document.createElement("div");
        card.className = "line-copilot-point-balance-card";
        const title = document.createElement("span"); title.textContent = label;
        const value = document.createElement("strong"); value.textContent = `${formatPoint(sourceTotal(key))} K點`;
        const mapping = document.createElement("small"); mapping.textContent = sourceUid(key) ? "已對應會員" : "尚未對應";
        card.append(title, value, mapping); container.appendChild(card);
      });
    }
    const hasAnyIdentity = Boolean(sourceUid("oa1") || sourceUid("oa2"));
    setHidden("line-copilot-point-content", false);
    setText("line-copilot-customer-data-status", hasAnyIdentity ? `已依 LINE UID 讀取${balances.length ? " K 點" : "，目前無 K 點資料"}` : `UID ${uid || "未取得"} 尚未對應母站會員`);
    const source = get("line-copilot-point-source")?.value || "oa1";
    const grant = get("line-copilot-point-grant");
    const deduct = get("line-copilot-point-deduct");
    if (grant) grant.disabled = source === "oa2" || !sourceUid(source);
    if (deduct) deduct.disabled = !sourceUid(source);
    if (resolved.source === "not_found" || !hasAnyIdentity) setText("line-copilot-customer-data-status", "尚未完成母站會員對應，請先到 MLM 後台綁定；目前禁止贈扣點");
  }

  async function loadCustomer(force = false) {
    const chat = runtime.chat || runtime.getLatestChat?.() || {};
    const uid = validLineUid(chat.conversationId) ? chat.conversationId : "";
    if (!runtime.token || !uid) { renderPoints(); return; }
    if (!force && runtime.data?.customer?.userId === uid) { renderPoints(); return; }
    const sequence = ++runtime.requestSequence;
    runtime.loadingUid = uid;
    setText("line-copilot-customer-data-status", "正在讀取 MLM 客戶與 K 點資料…");
    try {
      const path = `/api/copilot/customer?floor=main&uid=${encodeURIComponent(uid)}&name=${encodeURIComponent(chat.contactName || "")}`;
      const response = await sendMessage({ type: "LINE_COPILOT_MLM_REQUEST", token: runtime.token, path, method: "GET" });
      if (sequence !== runtime.requestSequence || uid !== runtime.chat?.conversationId) return;
      runtime.data = response.data?.data || null;
      renderPoints();
    } catch (error) {
      if (sequence !== runtime.requestSequence) return;
      if (/401|expired|Unauthorized|session/i.test(error.message || "")) logout(false);
      setText("line-copilot-customer-data-status", error.message || "無法讀取 MLM 客戶資料");
    } finally {
      if (runtime.loadingUid === uid) runtime.loadingUid = "";
    }
  }

  async function login() {
    const username = get("line-copilot-mlm-username")?.value.trim() || "";
    const passwordElement = get("line-copilot-mlm-password");
    const password = passwordElement?.value || "";
    if (!username || !password) { setText("line-copilot-customer-data-status", "請輸入 MLM 客服帳號與密碼"); return; }
    const button = get("line-copilot-mlm-login-button");
    if (button) button.disabled = true;
    setText("line-copilot-customer-data-status", "正在驗證 MLM 帳號…");
    try {
      const response = await sendMessage({ type: "LINE_COPILOT_MLM_LOGIN", username, password });
      runtime.token = response.data.token || "";
      runtime.expiresAt = Number(response.data.expiresAt || 0);
      runtime.profile = response.data.profile || null;
      runtime.data = null;
      renderAuth();
      await loadCustomer(true);
    } catch (error) {
      setText("line-copilot-customer-data-status", error.message || "MLM 登入失敗");
    } finally {
      if (passwordElement) passwordElement.value = "";
      if (button) button.disabled = false;
    }
  }

  function logout(showMessage = true) {
    runtime.token = "";
    runtime.expiresAt = 0;
    runtime.profile = null;
    runtime.data = null;
    runtime.requestSequence += 1;
    renderPoints();
    if (showMessage) setText("line-copilot-customer-data-status", "已登出 MLM；短效 Token 已清除");
  }

  async function mutate(action) {
    const source = get("line-copilot-point-source")?.value || "oa1";
    const lineUserId = sourceUid(source);
    const amount = Math.abs(Number(get("line-copilot-point-amount")?.value || 0));
    const note = get("line-copilot-point-note")?.value.trim() || "";
    if (!lineUserId) { setText("line-copilot-customer-data-status", "此來源尚未對應母站會員，禁止操作"); return; }
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) { setText("line-copilot-customer-data-status", "請輸入大於 0 的整數 K 點"); return; }
    if (!note) { setText("line-copilot-customer-data-status", "請填寫操作原因"); return; }
    if (source === "oa2" && action === "grant") { setText("line-copilot-customer-data-status", "康立全球只能扣 K 點"); return; }
    const label = action === "grant" ? "贈送" : "扣除";
    if (!window.confirm(`確定要為目前客戶${label} ${amount} K 點嗎？\n來源：${source === "oa1" ? "康立智能" : "康立全球"}\n原因：${note}`)) return;
    const buttons = [get("line-copilot-point-grant"), get("line-copilot-point-deduct")].filter(Boolean);
    buttons.forEach((button) => { button.disabled = true; });
    setText("line-copilot-customer-data-status", "正在送出 K 點異動…");
    try {
      const body = {
        channel_key: source,
        line_user_id: lineUserId,
        chat_line_user_id: runtime.chat?.conversationId || "",
        point_type: "gift_money",
        points: amount,
        operator_name: runtime.profile?.displayName || "LINE COPILOT 客服",
        operator_id: runtime.profile?.userId || "line-copilot",
        note,
        event_name: `${source === "oa1" ? "康立智能" : "康立全球"}${action === "grant" ? "贈K點" : "扣K點"}`,
        event_content: note,
        business_key: `line-copilot:${action}:${runtime.chat?.conversationId || "unknown"}:${Date.now()}`
      };
      const response = await sendMessage({ type: "LINE_COPILOT_MLM_REQUEST", token: runtime.token, path: `/admin/points/${action}`, method: "POST", body });
      const balance = response.data?.balance_after;
      setText("line-copilot-customer-data-status", `${label}完成${balance === undefined ? "" : `，目前餘額 ${formatPoint(balance)} K點`}`);
      const noteElement = get("line-copilot-point-note"); if (noteElement) noteElement.value = "";
      runtime.data = null;
      await loadCustomer(true);
    } catch (error) {
      setText("line-copilot-customer-data-status", error.message || "K 點操作失敗");
    } finally {
      renderPoints();
    }
  }

  async function copyUid() {
    const uid = validLineUid(runtime.chat?.conversationId) ? runtime.chat.conversationId : "";
    if (!uid) return;
    try { await navigator.clipboard.writeText(uid); setText("line-copilot-customer-data-status", "LINE UID 已複製"); }
    catch (_error) { setText("line-copilot-customer-data-status", "無法複製 LINE UID"); }
  }

  function init(root, getLatestChat) {
    if (!root || root.dataset.lineCopilotCustomerInitialized === "true") return;
    root.dataset.lineCopilotCustomerInitialized = "true";
    runtime.root = root;
    runtime.getLatestChat = getLatestChat;
    get("line-copilot-mlm-login-button")?.addEventListener("click", login);
    get("line-copilot-mlm-password")?.addEventListener("keydown", (event) => { if (event.key === "Enter") login(); });
    get("line-copilot-mlm-logout")?.addEventListener("click", () => logout(true));
    get("line-copilot-customer-refresh")?.addEventListener("click", () => loadCustomer(true));
    get("line-copilot-point-source")?.addEventListener("change", renderPoints);
    get("line-copilot-point-grant")?.addEventListener("click", () => mutate("grant"));
    get("line-copilot-point-deduct")?.addEventListener("click", () => mutate("deduct"));
    get("line-copilot-summary-copy-uid")?.addEventListener("click", copyUid);
    renderAuth();
  }

  function updateChatState(state) {
    const previousUid = runtime.chat?.conversationId;
    runtime.chat = state || null;
    const uid = validLineUid(state?.conversationId) ? state.conversationId : "";
    if (uid !== previousUid) {
      runtime.data = null;
      runtime.requestSequence += 1;
    }
    renderPoints();
    if (runtime.token && uid && runtime.data?.customer?.userId !== uid && runtime.loadingUid !== uid) loadCustomer(false);
  }

  globalThis.LINE_COPILOT_CUSTOMER = Object.freeze({ createSectionMarkup, init, updateChatState });
})();
