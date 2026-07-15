(() => {
  "use strict";

  const EMPTY_VALUE = "尚未偵測到";
  const MAX_QUESTION_LENGTH = 2000;
  const REQUEST_COOLDOWN_MS = 800;
  const FRIENDLY_ADJUSTMENT = "請將剛才的建議調整得更親切自然。";
  const SHORT_ADJUSTMENT = "請將剛才的建議縮短，保留最重要資訊。";
  const copilotState = { auth: { loggedIn: false, plan: "free" }, usage: { remaining: null }, currentChat: {}, aiRequest: { loading: false, lastRequestId: null } };
  const runtime = { root: null, getLatestChat: null, lastAttemptAt: 0, lastQuestion: "", lastQuickInstruction: "", lastPayload: null, lastResponse: null, activeController: null, requestSequence: 0, chatKey: null, preferredIncludeContext: true };

  function createSectionMarkup() {
    return `
      <section class="line-copilot-ai-section" aria-labelledby="line-copilot-ai-heading">
        <h2 id="line-copilot-ai-heading" class="line-copilot-section-title">AI 建議回覆</h2>
        <label class="line-copilot-ai-label" for="line-copilot-ai-question">補充客服需求</label>
        <textarea id="line-copilot-ai-question" class="line-copilot-ai-textarea" rows="4" maxlength="2000" placeholder="可補充客服需求，例如：&#10;「請用親切語氣回覆」&#10;「不要太像廣告」&#10;「請先說明注意事項」"></textarea>
        <div class="line-copilot-ai-counter-row"><span class="line-copilot-ai-enter-note">Enter 不會送出，可直接換行</span><span id="line-copilot-ai-remaining" class="line-copilot-ai-remaining">剩餘 2000 字</span></div>
        <label class="line-copilot-ai-context-option"><input id="line-copilot-ai-include-context" class="line-copilot-ai-checkbox" type="checkbox" checked><span>帶入目前聊天室最近訊息</span></label>
        <div class="line-copilot-ai-context-row"><span id="line-copilot-ai-context-count" class="line-copilot-ai-context-count">已帶入 0 則對話</span><button id="line-copilot-ai-context-toggle" class="line-copilot-ai-link-button" type="button" aria-expanded="false" aria-controls="line-copilot-ai-context-preview">查看對話內容</button></div>
        <ol id="line-copilot-ai-context-preview" class="line-copilot-ai-context-preview" hidden><li class="line-copilot-ai-context-empty">尚無可帶入的文字訊息</li></ol>
        <div class="line-copilot-ai-actions line-copilot-ai-primary-actions"><button id="line-copilot-ai-generate" class="line-copilot-primary-button" type="button"><span id="line-copilot-ai-generate-label">產生建議回覆</span></button><button id="line-copilot-ai-clear" class="line-copilot-secondary-button" type="button">清除</button></div>
        <div id="line-copilot-ai-loading" class="line-copilot-ai-loading" role="status" aria-live="polite" hidden><span class="line-copilot-spinner" aria-hidden="true"></span><span>正在整理建議回覆…</span></div>
        <div id="line-copilot-ai-error" class="line-copilot-ai-error" role="alert" hidden><span id="line-copilot-ai-error-text"></span><button id="line-copilot-ai-error-close" class="line-copilot-ai-error-close" type="button" aria-label="關閉錯誤訊息">×</button></div>
        <p id="line-copilot-ai-chat-change" class="line-copilot-ai-chat-change" role="status" hidden>已切換聊天對象，請重新產生建議。</p>
      </section>
      <section id="line-copilot-ai-result-card" class="line-copilot-ai-result-card" aria-labelledby="line-copilot-ai-result-heading">
        <div class="line-copilot-result-heading-row"><h2 id="line-copilot-ai-result-heading" class="line-copilot-section-title">建議回覆</h2><span id="line-copilot-ai-mode-badge" class="line-copilot-mode-badge" hidden>測試模式</span></div>
        <div id="line-copilot-ai-empty-state" class="line-copilot-ai-empty-state">AI 會根據目前對話與您的補充需求，產生可供客服參考的回覆。</div>
        <div id="line-copilot-ai-result-content" hidden>
          <div id="line-copilot-ai-result-text" class="line-copilot-ai-result-text" tabindex="0"></div>
          <div class="line-copilot-ai-result-meta"><span id="line-copilot-ai-created-at">—</span><span id="line-copilot-ai-context-used">已帶入 0 則對話</span></div>
          <div class="line-copilot-result-actions"><button id="line-copilot-ai-copy" class="line-copilot-primary-button" type="button">複製回覆</button><button id="line-copilot-ai-regenerate" class="line-copilot-secondary-button" type="button">重新產生</button><button id="line-copilot-ai-friendlier" class="line-copilot-secondary-button" type="button">更親切</button><button id="line-copilot-ai-shorter" class="line-copilot-secondary-button" type="button">更簡短</button></div>
          <p id="line-copilot-ai-copy-status" class="line-copilot-ai-copy-status" role="status" aria-live="polite"></p>
        </div>
      </section>`;
  }

  function getElement(id) { return runtime.root?.querySelector(`#${id}`) || null; }
  function normalizeChatState(state) {
    const contactName = state?.contactName && state.contactName !== EMPTY_VALUE ? state.contactName : null;
    const conversationId = state?.conversationId && state.conversationId !== EMPTY_VALUE ? state.conversationId : null;
    return { isOpen: Boolean(state?.isOpen), contactName, conversationId, currentUrl: state?.currentUrl || globalThis.location.href, messages: Array.isArray(state?.messages) ? state.messages : [] };
  }
  function selectVisibleMessages(messages) {
    const limit = Number(globalThis.LINE_COPILOT_CONFIG?.MAX_VISIBLE_MESSAGES) || 5;
    const clean = (messages || []).filter((message) => typeof message?.text === "string" && message.text.trim()).map((message) => ({ text: message.text.trim(), role: ["customer", "operator", "system", "unknown"].includes(message.role) ? message.role : "unknown", time: typeof message.time === "string" && message.time.trim() ? message.time.trim() : null, confidence: ["high", "medium", "low"].includes(message.confidence) ? message.confidence : "low" }));
    const reliable = clean.filter((message) => message.confidence !== "low");
    return (reliable.length ? reliable : clean).slice(-limit);
  }
  function getSelectedContext() {
    const checkbox = getElement("line-copilot-ai-include-context");
    return copilotState.currentChat.isOpen && checkbox?.checked ? selectVisibleMessages(copilotState.currentChat.messages) : [];
  }
  function renderContextPreview() {
    const list = getElement("line-copilot-ai-context-preview");
    const count = getElement("line-copilot-ai-context-count");
    if (!list || !count) return;
    const messages = getSelectedContext();
    count.textContent = `已帶入 ${messages.length} 則對話`;
    list.replaceChildren();
    if (!messages.length) {
      const item = document.createElement("li"); item.className = "line-copilot-ai-context-empty"; item.textContent = "尚無可帶入的文字訊息"; list.appendChild(item); return;
    }
    messages.forEach((message) => {
      const item = document.createElement("li"); item.className = "line-copilot-ai-context-item";
      const role = document.createElement("span"); role.className = "line-copilot-ai-context-role"; role.textContent = message.role === "customer" ? "客戶" : message.role === "operator" ? "客服" : message.role === "system" ? "系統" : "未知（來源不確定）";
      const text = document.createElement("span"); text.className = "line-copilot-ai-context-text"; text.textContent = message.text;
      item.append(role, text); list.appendChild(item);
    });
  }
  function updateQuestionUi() {
    const textarea = getElement("line-copilot-ai-question"); const remaining = getElement("line-copilot-ai-remaining");
    if (textarea && remaining) remaining.textContent = `剩餘 ${MAX_QUESTION_LENGTH - textarea.value.length} 字`;
  }
  function setError(message = "") {
    const box = getElement("line-copilot-ai-error"); const text = getElement("line-copilot-ai-error-text");
    if (text) text.textContent = message; if (box) box.hidden = !message;
  }
  function setLoading(loading) {
    copilotState.aiRequest.loading = loading;
    ["line-copilot-ai-generate", "line-copilot-ai-regenerate", "line-copilot-ai-friendlier", "line-copilot-ai-shorter"].forEach((id) => { const button = getElement(id); if (button) button.disabled = loading; });
    runtime.root?.querySelectorAll(".line-copilot-quick-button").forEach((button) => { button.disabled = loading; });
    const loadingBox = getElement("line-copilot-ai-loading"); if (loadingBox) loadingBox.hidden = !loading;
  }
  function validateQuestion(question) { if (!question) return "請先輸入問題"; if (question.length < 2) return "問題至少需要 2 個字元"; if (question.length > MAX_QUESTION_LENGTH) return "問題最多 2000 個字元"; return ""; }
  function buildPayload(question) {
    const context = getSelectedContext();
    return { question, contactName: copilotState.currentChat.contactName || null, conversationId: copilotState.currentChat.conversationId || null, currentUrl: copilotState.currentChat.currentUrl || globalThis.location.href, visibleMessages: context, source: "chrome-extension", extensionVersion: "1.4.1", instructions: { language: "zh-TW", replyMode: "suggestion-only", mustBeReviewedByHuman: true, doNotAutoSend: true } };
  }
  function formatCreatedAt(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value || "—") : date.toLocaleString("zh-TW"); }
  function renderDebug(payload, response = null) {
    const payloadElement = getElement("line-copilot-debug-request-payload"); if (payloadElement) payloadElement.textContent = JSON.stringify(payload, null, 2);
    if (!response) return;
    const metadata = { success: response.success, source: response.source || null, createdAt: response.createdAt || null, knowledgeMatches: response.knowledgeMatches || null };
    const responseElement = getElement("line-copilot-debug-response-meta"); if (responseElement) responseElement.textContent = JSON.stringify(metadata, null, 2);
    const requestId = getElement("line-copilot-debug-request-id"); if (requestId) requestId.textContent = response.requestId || "—";
    const model = getElement("line-copilot-debug-model"); if (model) model.textContent = response.model || "—";
    const usage = getElement("line-copilot-debug-usage"); if (usage) usage.textContent = response.usage ? JSON.stringify(response.usage) : "—";
    const mock = getElement("line-copilot-debug-mock-status"); if (mock) mock.textContent = response.model === "mock" ? "啟用" : "未使用";
  }
  function renderResult(response, payload) {
    getElement("line-copilot-ai-empty-state").hidden = true; getElement("line-copilot-ai-result-content").hidden = false;
    getElement("line-copilot-ai-result-text").textContent = response.suggestion;
    getElement("line-copilot-ai-created-at").textContent = formatCreatedAt(response.createdAt);
    getElement("line-copilot-ai-context-used").textContent = `已帶入 ${payload.visibleMessages.length} 則對話`;
    const badge = getElement("line-copilot-ai-mode-badge"); if (badge) badge.hidden = response.model !== "mock";
    const copyStatus = getElement("line-copilot-ai-copy-status"); if (copyStatus) copyStatus.textContent = "";
    renderDebug(payload, response);
  }
  function clearResult({ showEmpty = true } = {}) {
    const content = getElement("line-copilot-ai-result-content"); const empty = getElement("line-copilot-ai-empty-state"); const text = getElement("line-copilot-ai-result-text");
    if (content) content.hidden = true; if (empty) empty.hidden = !showEmpty; if (text) text.textContent = "";
    const badge = getElement("line-copilot-ai-mode-badge"); if (badge) badge.hidden = true;
    runtime.lastResponse = null; copilotState.aiRequest.lastRequestId = null;
  }
  async function generateSuggestion(questionOverride = null) {
    if (copilotState.aiRequest.loading) return;
    const now = Date.now(); if (now - runtime.lastAttemptAt < REQUEST_COOLDOWN_MS) return;
    const textarea = getElement("line-copilot-ai-question"); const question = String(questionOverride ?? textarea?.value ?? "").trim();
    const validationError = validateQuestion(question); setError(validationError); if (validationError) return;
    runtime.lastAttemptAt = now; runtime.lastQuestion = question; const payload = buildPayload(question); runtime.lastPayload = payload; renderDebug(payload);
    const sequence = ++runtime.requestSequence; runtime.activeController?.abort(); runtime.activeController = new AbortController(); setLoading(true); setError("");
    try {
      const response = await globalThis.LINE_COPILOT_API.requestAiSuggestion(payload, { signal: runtime.activeController.signal });
      if (sequence !== runtime.requestSequence) return; runtime.lastResponse = response; copilotState.aiRequest.lastRequestId = response.requestId || null; renderResult(response, payload);
    } catch (error) { if (sequence === runtime.requestSequence) setError(error?.message || "LINE COPILOT 無法處理本次請求，請稍後再試"); }
    finally { if (sequence === runtime.requestSequence) setLoading(false); }
  }
  function applyAdjustment(instruction) {
    const base = runtime.lastQuestion || getElement("line-copilot-ai-question")?.value.trim() || "";
    const adjusted = [base, instruction].filter(Boolean).join("\n");
    const textarea = getElement("line-copilot-ai-question"); if (textarea) textarea.value = adjusted; updateQuestionUi(); generateSuggestion(adjusted);
  }
  function clearSuggestion() {
    runtime.requestSequence += 1; runtime.activeController?.abort(); runtime.activeController = null; runtime.lastQuestion = ""; runtime.lastQuickInstruction = ""; runtime.lastPayload = null; copilotState.aiRequest.loading = false;
    const textarea = getElement("line-copilot-ai-question"); if (textarea) textarea.value = ""; clearResult(); setLoading(false); setError("");
    const notice = getElement("line-copilot-ai-chat-change"); if (notice) notice.hidden = true; const copyStatus = getElement("line-copilot-ai-copy-status"); if (copyStatus) copyStatus.textContent = ""; updateQuestionUi();
  }
  function selectResultText(element) { const selection = globalThis.getSelection?.(); if (!selection || !element) return; const range = document.createRange(); range.selectNodeContents(element); selection.removeAllRanges(); selection.addRange(range); element.focus(); }
  async function copySuggestion() {
    const textElement = getElement("line-copilot-ai-result-text"); const status = getElement("line-copilot-ai-copy-status"); const text = textElement?.textContent?.trim() || ""; if (!text) return;
    try { await navigator.clipboard.writeText(text); if (status) status.textContent = "已複製，可貼到 LINE OA 聊天輸入框"; }
    catch (_error) { selectResultText(textElement); if (status) status.textContent = "複製失敗，已選取建議文字，請按 Ctrl+C 手動複製"; }
  }
  function applyQuickAction(button) {
    if (copilotState.aiRequest.loading) return; const prompt = button?.dataset.lineCopilotPrompt || ""; if (!prompt) return;
    const textarea = getElement("line-copilot-ai-question"); if (textarea) { textarea.value = prompt; textarea.focus(); }
    runtime.lastQuickInstruction = button.dataset.lineCopilotQuick || ""; runtime.root?.querySelectorAll(".line-copilot-quick-button").forEach((item) => item.classList.toggle("line-copilot-quick-active", item === button)); updateQuestionUi();
  }
  function init(root, getLatestChat) {
    if (!root || root.dataset.lineCopilotAiInitialized === "true") return; runtime.root = root; runtime.getLatestChat = getLatestChat; root.dataset.lineCopilotAiInitialized = "true";
    getElement("line-copilot-ai-question")?.addEventListener("input", updateQuestionUi);
    getElement("line-copilot-ai-include-context")?.addEventListener("change", (event) => { runtime.preferredIncludeContext = event.currentTarget.checked; renderContextPreview(); });
    getElement("line-copilot-ai-context-toggle")?.addEventListener("click", (event) => { const preview = getElement("line-copilot-ai-context-preview"); const expanded = event.currentTarget.getAttribute("aria-expanded") === "true"; event.currentTarget.setAttribute("aria-expanded", String(!expanded)); event.currentTarget.textContent = expanded ? "查看對話內容" : "收合對話內容"; if (preview) preview.hidden = expanded; });
    getElement("line-copilot-ai-generate")?.addEventListener("click", () => generateSuggestion());
    getElement("line-copilot-ai-regenerate")?.addEventListener("click", () => generateSuggestion(runtime.lastQuestion));
    getElement("line-copilot-ai-friendlier")?.addEventListener("click", () => applyAdjustment(FRIENDLY_ADJUSTMENT));
    getElement("line-copilot-ai-shorter")?.addEventListener("click", () => applyAdjustment(SHORT_ADJUSTMENT));
    getElement("line-copilot-ai-clear")?.addEventListener("click", clearSuggestion); getElement("line-copilot-ai-copy")?.addEventListener("click", copySuggestion); getElement("line-copilot-ai-error-close")?.addEventListener("click", () => setError(""));
    root.querySelectorAll(".line-copilot-quick-button").forEach((button) => button.addEventListener("click", () => applyQuickAction(button)));
    updateQuestionUi(); updateChatState(runtime.getLatestChat?.() || {});
  }
  function updateChatState(state) {
    const next = normalizeChatState(state); const nextKey = next.isOpen ? next.conversationId || next.contactName || next.currentUrl : null;
    const switched = runtime.chatKey !== null && nextKey !== runtime.chatKey;
    copilotState.currentChat = next; runtime.chatKey = nextKey;
    const checkbox = getElement("line-copilot-ai-include-context"); if (checkbox) { checkbox.disabled = !next.isOpen; checkbox.checked = next.isOpen ? runtime.preferredIncludeContext : false; }
    if (switched && runtime.lastResponse) { runtime.requestSequence += 1; runtime.activeController?.abort(); clearResult(); const notice = getElement("line-copilot-ai-chat-change"); if (notice) notice.hidden = false; }
    renderContextPreview();
  }

  globalThis.LINE_COPILOT_AI = Object.freeze({ createSectionMarkup, init, updateChatState, selectVisibleMessages, buildPayload, getState: () => copilotState });
})();
