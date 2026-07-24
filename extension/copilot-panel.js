(() => {
  "use strict";

  const EMPTY_VALUE = "尚未偵測到";
  const get = (root, id) => root?.querySelector(`#${id}`) || null;
  const setText = (root, id, value, fallback = EMPTY_VALUE) => {
    const element = get(root, id);
    if (element) element.textContent = value || fallback;
  };

  function createQuickActionsMarkup() {
    const actions = [
      ["suggest", "建議怎麼回", "請根據目前對話，提供適合客服使用的回覆建議。"],
      ["friendly", "回覆更親切", "請將回覆調整得更親切、自然，但不要過度推銷。"],
      ["short", "回覆更簡短", "請提供簡短、清楚、可以直接傳送的回覆。"],
      ["comfort", "客訴安撫", "請先同理客戶情緒，再提出清楚的處理方式。"],
      ["product", "產品說明", "請根據目前問題，用簡單易懂的方式說明產品資訊。"],
      ["convert", "引導成交", "請在不造成壓力的前提下，自然引導客戶進行下一步。"]
    ];
    return `
      <section class="line-copilot-quick-section" aria-labelledby="line-copilot-quick-heading">
        <div class="line-copilot-section-heading-row">
          <h2 id="line-copilot-quick-heading" class="line-copilot-section-title">快速操作</h2>
          <span class="line-copilot-section-note">選擇後仍需確認送出</span>
        </div>
        <div class="line-copilot-quick-actions">
          ${actions.map(([key, label, prompt]) => `<button class="line-copilot-quick-button" type="button" data-line-copilot-quick="${key}" data-line-copilot-prompt="${prompt}">${label}</button>`).join("")}
        </div>
      </section>`;
  }

  function createCustomerInfoMarkup() {
    return `
      <details id="line-copilot-customer-details" class="line-copilot-foldout">
        <summary class="line-copilot-foldout-summary"><span>客戶與聊天室資訊</span><span class="line-copilot-foldout-hint">查看</span></summary>
        <div class="line-copilot-foldout-content">
          <dl class="line-copilot-detail-list">
            <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">聊天對象</dt><dd id="line-copilot-contact-name" class="line-copilot-detail-value">偵測中</dd></div>
            <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">聊天室已開啟</dt><dd id="line-copilot-chat-open" class="line-copilot-detail-value">偵測中</dd></div>
            <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">最近訊息數量</dt><dd id="line-copilot-info-message-count" class="line-copilot-detail-value">0</dd></div>
            <div class="line-copilot-detail-row line-copilot-detail-row-stacked"><dt class="line-copilot-detail-label">最後偵測時間</dt><dd id="line-copilot-detected-at" class="line-copilot-detail-value">偵測中</dd></div>
            <div class="line-copilot-detail-row line-copilot-detail-row-stacked"><dt class="line-copilot-detail-label">聊天室 ID</dt><dd id="line-copilot-conversation-id" class="line-copilot-detail-value line-copilot-detail-mono">偵測中</dd></div>
            <div class="line-copilot-detail-row line-copilot-detail-row-stacked"><dt class="line-copilot-detail-label">目前網址</dt><dd id="line-copilot-current-url" class="line-copilot-detail-value line-copilot-detail-mono">偵測中</dd></div>
            <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">偵測來源</dt><dd id="line-copilot-contact-source" class="line-copilot-detail-value line-copilot-detail-mono">unknown</dd></div>
            <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">信心程度</dt><dd id="line-copilot-contact-confidence" class="line-copilot-detail-value">low</dd></div>
            <div class="line-copilot-detail-row line-copilot-detail-row-stacked"><dt class="line-copilot-detail-label">最後成功偵測時間</dt><dd id="line-copilot-contact-success-time" class="line-copilot-detail-value">尚未偵測到</dd></div>
          </dl>
        </div>
      </details>`;
  }

  function createDebugMarkup() {
    return `
      <details id="line-copilot-debug-details" class="line-copilot-foldout line-copilot-debug-foldout">
        <summary class="line-copilot-foldout-summary"><span>開發與偵錯資訊</span><span class="line-copilot-foldout-hint">開發用</span></summary>
        <section id="line-copilot-debug-panel" class="line-copilot-foldout-content line-copilot-debug-panel">
          <dl class="line-copilot-detail-list">
            <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">訊息串候選</dt><dd id="line-copilot-debug-stream-count" class="line-copilot-detail-value">0</dd></div>
            <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">名稱候選</dt><dd id="line-copilot-debug-name-count" class="line-copilot-detail-value">0</dd></div>
            <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">訊息候選</dt><dd id="line-copilot-debug-message-count" class="line-copilot-detail-value">0</dd></div>
            <div class="line-copilot-detail-row line-copilot-detail-row-stacked"><dt class="line-copilot-detail-label">名稱選擇原因</dt><dd id="line-copilot-debug-selection-reason" class="line-copilot-detail-value">尚未偵測到</dd></div>
            <div class="line-copilot-detail-row line-copilot-detail-row-stacked"><dt class="line-copilot-detail-label">偵測策略</dt><dd id="line-copilot-debug-strategy" class="line-copilot-detail-value line-copilot-detail-mono">尚未偵測到</dd></div>
            <div class="line-copilot-detail-row line-copilot-detail-row-stacked"><dt class="line-copilot-detail-label">最近 DOM 更新</dt><dd id="line-copilot-debug-dom-time" class="line-copilot-detail-value">尚未偵測到</dd></div>
            <div class="line-copilot-detail-row line-copilot-detail-row-stacked"><dt class="line-copilot-detail-label">Request payload</dt><dd id="line-copilot-debug-request-payload" class="line-copilot-detail-value line-copilot-detail-mono">尚未呼叫</dd></div>
            <div class="line-copilot-detail-row line-copilot-detail-row-stacked"><dt class="line-copilot-detail-label">Response metadata</dt><dd id="line-copilot-debug-response-meta" class="line-copilot-detail-value line-copilot-detail-mono">尚未呼叫</dd></div>
            <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">Request ID</dt><dd id="line-copilot-debug-request-id" class="line-copilot-detail-value line-copilot-detail-mono">—</dd></div>
            <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">Model</dt><dd id="line-copilot-debug-model" class="line-copilot-detail-value line-copilot-detail-mono">—</dd></div>
            <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">Token usage</dt><dd id="line-copilot-debug-usage" class="line-copilot-detail-value line-copilot-detail-mono">—</dd></div>
            <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">Mock API</dt><dd id="line-copilot-debug-mock-status" class="line-copilot-detail-value">—</dd></div>
          </dl>
          <h3 class="line-copilot-debug-heading">最近可見訊息（含 confidence）</h3><ol id="line-copilot-message-list" class="line-copilot-message-list"><li class="line-copilot-message-empty">偵測中</li></ol>
          <h3 class="line-copilot-debug-heading">聊天室 Header 候選元素</h3><ol id="line-copilot-debug-header-candidates" class="line-copilot-debug-list"><li class="line-copilot-debug-empty">尚未偵測到</li></ol>
          <button id="line-copilot-copy-header-report" class="line-copilot-secondary-button" type="button">複製 Header 診斷 JSON</button>
          <p id="line-copilot-header-export-result" class="line-copilot-debug-export-result" role="status" aria-live="polite"></p>
          <h3 class="line-copilot-debug-heading">名稱候選與評分</h3><ol id="line-copilot-debug-name-candidates" class="line-copilot-debug-list"><li class="line-copilot-debug-empty">尚未偵測到</li></ol>
          <h3 class="line-copilot-debug-heading">角色判斷依據</h3><ol id="line-copilot-debug-role-evidence" class="line-copilot-debug-list"><li class="line-copilot-debug-empty">尚未偵測到</li></ol>
          <h3 class="line-copilot-debug-heading">已排除候選</h3><ol id="line-copilot-debug-excluded" class="line-copilot-debug-list"><li class="line-copilot-debug-empty">尚未偵測到</li></ol>
          <button id="line-copilot-export-report" class="line-copilot-secondary-button" type="button">匯出偵測報告</button>
          <p id="line-copilot-debug-export-result" class="line-copilot-debug-export-result" role="status" aria-live="polite"></p>
        </section>
      </details>`;
  }

  function createPanelElement() {
    const root = document.createElement("aside");
    root.id = "line-copilot-root";
    root.className = "line-copilot-root";
    root.setAttribute("aria-label", "LINE COPILOT 面板");
    root.setAttribute("aria-expanded", "true");
    root.innerHTML = `
      <button id="line-copilot-expand-button" class="line-copilot-expand-button" type="button" aria-label="展開 LINE COPILOT 面板" title="展開 LINE COPILOT">LC</button>
      <section class="line-copilot-panel">
        <header class="line-copilot-header">
          <div class="line-copilot-heading-group"><span class="line-copilot-brand-mark" aria-hidden="true">LC</span><div class="line-copilot-heading-copy"><h1 class="line-copilot-title">LINE COPILOT</h1><span class="line-copilot-subtitle">AI 客服助手</span></div></div>
          <div class="line-copilot-header-actions"><button id="line-copilot-fullscreen-button" class="line-copilot-icon-button line-copilot-fullscreen-button" type="button" aria-label="切換為全螢幕" title="全螢幕" aria-pressed="false">⛶</button><button id="line-copilot-collapse-button" class="line-copilot-icon-button" type="button" aria-label="收合 LINE COPILOT 面板" title="收合面板">›</button></div>
        </header>
        <main class="line-copilot-content">
          <section id="line-copilot-customer-summary" class="line-copilot-customer-summary" aria-labelledby="line-copilot-summary-name">
            <div class="line-copilot-summary-top"><div class="line-copilot-summary-identity"><span class="line-copilot-summary-avatar-wrap"><img id="line-copilot-summary-avatar" class="line-copilot-summary-avatar" alt="LINE 客戶頭貼" referrerpolicy="no-referrer" hidden><span id="line-copilot-summary-avatar-fallback" class="line-copilot-summary-avatar-fallback" aria-hidden="true">客</span></span><div><p class="line-copilot-summary-eyebrow">目前客戶</p><h2 id="line-copilot-summary-name" class="line-copilot-summary-name">偵測中</h2><div class="line-copilot-summary-uid-row"><span>聊天室 ID</span><code id="line-copilot-summary-uid">尚未取得</code><button id="line-copilot-summary-copy-uid" class="line-copilot-ai-link-button" type="button">複製</button></div></div></div><span id="line-copilot-summary-status" class="line-copilot-summary-status">偵測中</span></div>
            <div class="line-copilot-summary-message"><span class="line-copilot-summary-label">最近一則客戶訊息</span><p id="line-copilot-summary-message" class="line-copilot-summary-message-text">尚未讀取到可用對話</p></div>
            <p id="line-copilot-summary-context" class="line-copilot-summary-context">正在讀取對話</p>
            <p id="line-copilot-summary-help" class="line-copilot-summary-help" hidden>請先在 LINE OA 左側選擇一位客戶，或直接輸入問題使用 AI 建議。</p>
          </section>
          ${globalThis.LINE_COPILOT_CUSTOMER?.createSectionMarkup?.() || ""}
          ${createQuickActionsMarkup()}
          ${globalThis.LINE_COPILOT_AI?.createSectionMarkup?.() || ""}
          ${createCustomerInfoMarkup()}
          ${createDebugMarkup()}
        </main>
        <footer class="line-copilot-footer"><button id="line-copilot-privacy-toggle" class="line-copilot-footer-link" type="button" aria-expanded="false">隱私說明</button><span class="line-copilot-footer-separator">·</span><button id="line-copilot-footer-debug" class="line-copilot-footer-link" type="button">開發與偵錯</button><span class="line-copilot-footer-separator">·</span><span class="line-copilot-version">v2.0.0 FREE</span><p id="line-copilot-privacy-note" class="line-copilot-privacy" hidden>只讀取目前畫面可見對話並在本機比對您的知識庫；不串接 LINE Messaging API，也不自動傳送訊息。</p></footer>
      </section>`;
    return root;
  }

  function setCollapsed(root, collapsed) {
    if (!root) return;
    if (collapsed && root.classList.contains("line-copilot-fullscreen")) setFullscreen(root, false);
    root.classList.toggle("line-copilot-collapsed", collapsed);
    root.setAttribute("aria-expanded", String(!collapsed));
  }

  function setFullscreen(root, fullscreen) {
    if (!root) return;
    if (fullscreen) setCollapsed(root, false);
    root.classList.toggle("line-copilot-fullscreen", fullscreen);
    const button = get(root, "line-copilot-fullscreen-button");
    if (!button) return;
    button.setAttribute("aria-pressed", String(fullscreen));
    button.setAttribute("aria-label", fullscreen ? "返回側欄" : "切換為全螢幕");
    button.title = fullscreen ? "返回側欄" : "全螢幕";
    button.textContent = fullscreen ? "↙" : "⛶";
  }

  function init(root, callbacks = {}) {
    if (!root || root.dataset.lineCopilotPanelInitialized === "true") return;
    root.dataset.lineCopilotPanelInitialized = "true";
    get(root, "line-copilot-collapse-button")?.addEventListener("click", () => setCollapsed(root, true));
    get(root, "line-copilot-expand-button")?.addEventListener("click", () => setCollapsed(root, false));
    get(root, "line-copilot-fullscreen-button")?.addEventListener("click", () => setFullscreen(root, !root.classList.contains("line-copilot-fullscreen")));
    if (!globalThis.__LINE_COPILOT_FULLSCREEN_ESCAPE_BOUND__) {
      globalThis.__LINE_COPILOT_FULLSCREEN_ESCAPE_BOUND__ = true;
      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        const activeRoot = document.getElementById("line-copilot-root");
        if (activeRoot?.classList.contains("line-copilot-fullscreen")) setFullscreen(activeRoot, false);
      });
    }
    get(root, "line-copilot-export-report")?.addEventListener("click", callbacks.copyDiagnosticReport);
    get(root, "line-copilot-copy-header-report")?.addEventListener("click", callbacks.copyHeaderReport);
    get(root, "line-copilot-footer-debug")?.addEventListener("click", () => {
      const details = get(root, "line-copilot-debug-details");
      if (!details) return;
      details.open = true;
      details.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    get(root, "line-copilot-privacy-toggle")?.addEventListener("click", (event) => {
      const note = get(root, "line-copilot-privacy-note");
      if (!note) return;
      const expanded = event.currentTarget.getAttribute("aria-expanded") === "true";
      event.currentTarget.setAttribute("aria-expanded", String(!expanded));
      note.hidden = expanded;
    });
  }

  function updateChatState(root, state) {
    if (!root || !state) return;
    const isOpen = Boolean(state.isOpen);
    const contactName = state.contactName && state.contactName !== EMPTY_VALUE ? state.contactName : null;
    const messages = Array.isArray(state.messages) ? state.messages : [];
    const selected = globalThis.LINE_COPILOT_AI?.selectVisibleMessages?.(messages) || [];
    const latestCustomer = [...messages].reverse().find((message) => message.role === "customer" && message.text?.trim());

    setText(root, "line-copilot-summary-name", isOpen ? contactName : "尚未選擇聊天室", isOpen ? "尚未偵測到聊天對象" : "尚未選擇聊天室");
    setText(root, "line-copilot-summary-status", isOpen ? "已開啟聊天室" : "未選擇聊天室");
    setText(root, "line-copilot-summary-message", latestCustomer?.text, "尚未讀取到可用對話");
    setText(root, "line-copilot-summary-context", selected.length ? `已讀取最近 ${selected.length} 則對話` : "尚未讀取到可用對話");
    const help = get(root, "line-copilot-summary-help");
    if (help) help.hidden = isOpen;
    get(root, "line-copilot-customer-summary")?.classList.toggle("line-copilot-summary-empty", !isOpen);
    setText(root, "line-copilot-info-message-count", String(messages.length), "0");
  }

  globalThis.LINE_COPILOT_PANEL = Object.freeze({ createPanelElement, init, updateChatState, setCollapsed, setFullscreen });
})();
