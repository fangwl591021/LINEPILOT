(() => {
  "use strict";

  const EMPTY_VALUE = "尚未偵測到";
  const MAX_QUESTION_LENGTH = 2000;
  const REQUEST_COOLDOWN_MS = 800;
  const copilotState = {
    auth: { loggedIn: false, plan: "free" },
    usage: { remaining: null },
    currentChat: {},
    aiRequest: { loading: false, lastRequestId: null }
  };
  const runtime = {
    root: null,
    getLatestChat: null,
    lastAttemptAt: 0,
    lastQuestion: "",
    activeController: null,
    requestSequence: 0
  };

  function createSectionMarkup() {
    return `
      <section class="line-copilot-ai-section" aria-labelledby="line-copilot-ai-heading">
        <h2 id="line-copilot-ai-heading" class="line-copilot-section-title">AI 建議回覆</h2>
        <label class="line-copilot-ai-label" for="line-copilot-ai-question">問題或整理需求</label>
        <textarea id="line-copilot-ai-question" class="line-copilot-ai-textarea" rows="3" maxlength="2000" placeholder="請輸入客戶問題，或請 AI 協助整理回覆內容"></textarea>
        <div class="line-copilot-ai-counter-row"><span class="line-copilot-ai-enter-note">Enter 不會送出，Shift + Enter 可換行</span><span id="line-copilot-ai-remaining" class="line-copilot-ai-remaining">剩餘 2000 字</span></div>
        <label class="line-copilot-ai-context-option"><input id="line-copilot-ai-include-context" class="line-copilot-ai-checkbox" type="checkbox" checked><span>帶入目前聊天室最近訊息</span></label>
        <div class="line-copilot-ai-context-row"><span id="line-copilot-ai-context-count" class="line-copilot-ai-context-count">已帶入 0 則對話</span><button id="line-copilot-ai-context-toggle" class="line-copilot-ai-link-button" type="button" aria-expanded="false" aria-controls="line-copilot-ai-context-preview">展開預覽</button></div>
        <ol id="line-copilot-ai-context-preview" class="line-copilot-ai-context-preview" hidden><li class="line-copilot-ai-context-empty">尚無可帶入的文字訊息</li></ol>
        <div class="line-copilot-ai-actions"><button id="line-copilot-ai-generate" class="line-copilot-primary-button" type="button">產生 AI 建議</button><button id="line-copilot-ai-clear" class="line-copilot-secondary-button" type="button">清除</button></div>
        <p id="line-copilot-ai-loading" class="line-copilot-ai-loading" role="status" aria-live="polite"></p>
        <p id="line-copilot-ai-error" class="line-copilot-ai-error" role="alert"></p>
        <section id="line-copilot-ai-result-card" class="line-copilot-ai-result-card" hidden aria-labelledby="line-copilot-ai-result-heading">
          <h3 id="line-copilot-ai-result-heading" class="line-copilot-ai-result-title">AI 建議結果</h3>
          <div id="line-copilot-ai-result-text" class="line-copilot-ai-result-text" tabindex="0"></div>
          <dl class="line-copilot-ai-result-meta"><div><dt>產生時間</dt><dd id="line-copilot-ai-created-at">—</dd></div><div><dt>聊天對象</dt><dd id="line-copilot-ai-contact-name">—</dd></div><div><dt>聊天室上下文</dt><dd id="line-copilot-ai-context-used">否</dd></div></dl>
          <div class="line-copilot-ai-actions"><button id="line-copilot-ai-copy" class="line-copilot-primary-button" type="button">一鍵複製</button><button id="line-copilot-ai-regenerate" class="line-copilot-secondary-button" type="button">重新產生</button></div>
          <p id="line-copilot-ai-copy-status" class="line-copilot-ai-copy-status" role="status" aria-live="polite"></p>
        </section>
        <p class="line-copilot-ai-review-notice">AI 建議僅供客服參考，送出前請人工確認。</p>
        <p class="line-copilot-ai-privacy-notice">只有在您點擊產生建議時，才會將本次問題與勾選的對話內容傳送至 LINE COPILOT 服務。</p>
      </section>`;
  }

  function getElement(id) {
    return runtime.root?.querySelector(`#${id}`) || null;
  }

  function normalizeChatState(state) {
    const contactName =
      state?.contactName && state.contactName !== EMPTY_VALUE ? state.contactName : null;
    const conversationId =
      state?.conversationId && state.conversationId !== EMPTY_VALUE
        ? state.conversationId
        : null;
    return {
      contactName,
      conversationId,
      currentUrl: state?.currentUrl || globalThis.location.href,
      messages: Array.isArray(state?.messages) ? state.messages : []
    };
  }

  function selectVisibleMessages(messages) {
    const limit = Number(globalThis.LINE_COPILOT_CONFIG?.MAX_VISIBLE_MESSAGES) || 5;
    const clean = (messages || [])
      .filter((message) => typeof message?.text === "string" && message.text.trim())
      .map((message) => ({
        text: message.text.trim(),
        role: ["customer", "operator", "system", "unknown"].includes(message.role)
          ? message.role
          : "unknown",
        time: typeof message.time === "string" && message.time.trim() ? message.time.trim() : null,
        confidence: ["high", "medium", "low"].includes(message.confidence)
          ? message.confidence
          : "low"
      }));
    const reliable = clean.filter((message) => message.confidence !== "low");
    const selected = reliable.length ? reliable : clean;
    return selected.slice(-limit);
  }

  function getSelectedContext() {
    const enabled = getElement("line-copilot-ai-include-context")?.checked !== false;
    return enabled ? selectVisibleMessages(copilotState.currentChat.messages) : [];
  }

  function renderContextPreview() {
    const list = getElement("line-copilot-ai-context-preview");
    const count = getElement("line-copilot-ai-context-count");
    if (!list || !count) return;
    const messages = getSelectedContext();
    count.textContent = `已帶入 ${messages.length} 則對話`;
    list.replaceChildren();
    if (!messages.length) {
      const item = document.createElement("li");
      item.className = "line-copilot-ai-context-empty";
      item.textContent = "尚無可帶入的文字訊息";
      list.appendChild(item);
      return;
    }
    messages.forEach((message) => {
      const item = document.createElement("li");
      item.className = "line-copilot-ai-context-item";
      const role = document.createElement("span");
      role.className = "line-copilot-ai-context-role";
      role.textContent =
        message.role === "customer"
          ? "客戶"
          : message.role === "operator"
            ? "客服"
            : message.role === "system"
              ? "系統"
              : "未知";
      const text = document.createElement("span");
      text.className = "line-copilot-ai-context-text";
      text.textContent = message.text;
      item.append(role, text);
      list.appendChild(item);
    });
  }

  function updateQuestionUi() {
    const textarea = getElement("line-copilot-ai-question");
    const remaining = getElement("line-copilot-ai-remaining");
    if (!textarea || !remaining) return;
    remaining.textContent = `剩餘 ${MAX_QUESTION_LENGTH - textarea.value.length} 字`;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }

  function setError(message = "") {
    const error = getElement("line-copilot-ai-error");
    if (error) error.textContent = message;
  }

  function setLoading(loading) {
    copilotState.aiRequest.loading = loading;
    const generate = getElement("line-copilot-ai-generate");
    const regenerate = getElement("line-copilot-ai-regenerate");
    const loadingText = getElement("line-copilot-ai-loading");
    if (generate) {
      generate.disabled = loading;
      generate.textContent = loading ? "正在產生建議…" : "產生 AI 建議";
    }
    if (regenerate) regenerate.disabled = loading;
    if (loadingText) loadingText.textContent = loading ? "正在產生建議…" : "";
  }

  function validateQuestion(question) {
    if (!question) return "請先輸入問題";
    if (question.length < 2) return "問題至少需要 2 個字元";
    if (question.length > MAX_QUESTION_LENGTH) return "問題最多 2000 個字元";
    return "";
  }

  function buildPayload(question) {
    const context = getSelectedContext();
    return {
      question,
      contactName: copilotState.currentChat.contactName || null,
      conversationId: copilotState.currentChat.conversationId || null,
      currentUrl: copilotState.currentChat.currentUrl || globalThis.location.href,
      visibleMessages: context,
      source: "chrome-extension",
      extensionVersion: "1.3.0",
      instructions: {
        language: "zh-TW",
        replyMode: "suggestion-only",
        mustBeReviewedByHuman: true,
        doNotAutoSend: true
      }
    };
  }

  function formatCreatedAt(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value || "—") : date.toLocaleString("zh-TW");
  }

  function renderResult(response, payload) {
    const card = getElement("line-copilot-ai-result-card");
    const text = getElement("line-copilot-ai-result-text");
    if (card) card.hidden = false;
    if (text) text.textContent = response.suggestion;
    const createdAt = getElement("line-copilot-ai-created-at");
    const contactName = getElement("line-copilot-ai-contact-name");
    const contextUsed = getElement("line-copilot-ai-context-used");
    const copyStatus = getElement("line-copilot-ai-copy-status");
    if (createdAt) createdAt.textContent = formatCreatedAt(response.createdAt);
    if (contactName) contactName.textContent = payload.contactName || EMPTY_VALUE;
    if (contextUsed) {
      contextUsed.textContent = payload.visibleMessages.length
        ? `是，${payload.visibleMessages.length} 則`
        : "否";
    }
    if (copyStatus) copyStatus.textContent = "";
  }

  async function generateSuggestion(useLastQuestion = false) {
    if (copilotState.aiRequest.loading) return;
    const now = Date.now();
    if (now - runtime.lastAttemptAt < REQUEST_COOLDOWN_MS) return;
    const textarea = getElement("line-copilot-ai-question");
    const question = (useLastQuestion ? runtime.lastQuestion : textarea?.value || "").trim();
    const validationError = validateQuestion(question);
    setError(validationError);
    if (validationError) return;

    runtime.lastAttemptAt = now;
    runtime.lastQuestion = question;
    const payload = buildPayload(question);
    const sequence = ++runtime.requestSequence;
    runtime.activeController?.abort();
    runtime.activeController = new AbortController();
    setLoading(true);
    setError("");
    try {
      const response = await globalThis.LINE_COPILOT_API.requestAiSuggestion(payload, {
        signal: runtime.activeController.signal
      });
      if (sequence !== runtime.requestSequence) return;
      copilotState.aiRequest.lastRequestId = response.requestId || null;
      renderResult(response, payload);
    } catch (error) {
      if (sequence !== runtime.requestSequence) return;
      setError(error?.message || "LINE COPILOT 無法處理本次請求，請稍後再試");
    } finally {
      if (sequence === runtime.requestSequence) setLoading(false);
    }
  }

  function clearSuggestion() {
    runtime.requestSequence += 1;
    runtime.activeController?.abort();
    runtime.activeController = null;
    runtime.lastQuestion = "";
    copilotState.aiRequest.loading = false;
    copilotState.aiRequest.lastRequestId = null;
    const textarea = getElement("line-copilot-ai-question");
    if (textarea) textarea.value = "";
    const card = getElement("line-copilot-ai-result-card");
    const text = getElement("line-copilot-ai-result-text");
    if (card) card.hidden = true;
    if (text) text.textContent = "";
    setLoading(false);
    setError("");
    const copyStatus = getElement("line-copilot-ai-copy-status");
    if (copyStatus) copyStatus.textContent = "";
    updateQuestionUi();
  }

  function selectResultText(element) {
    const selection = globalThis.getSelection?.();
    if (!selection || !element) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    element.focus();
  }

  async function copySuggestion() {
    const textElement = getElement("line-copilot-ai-result-text");
    const status = getElement("line-copilot-ai-copy-status");
    const text = textElement?.textContent?.trim() || "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (status) status.textContent = "已複製，可貼到 LINE OA 聊天輸入框";
    } catch (_error) {
      selectResultText(textElement);
      if (status) status.textContent = "複製失敗，已選取建議文字，請按 Ctrl+C 手動複製";
    }
  }

  function init(root, getLatestChat) {
    if (!root || root.dataset.lineCopilotAiInitialized === "true") return;
    runtime.root = root;
    runtime.getLatestChat = getLatestChat;
    root.dataset.lineCopilotAiInitialized = "true";
    getElement("line-copilot-ai-question")?.addEventListener("input", updateQuestionUi);
    getElement("line-copilot-ai-include-context")?.addEventListener(
      "change",
      renderContextPreview
    );
    getElement("line-copilot-ai-context-toggle")?.addEventListener("click", (event) => {
      const preview = getElement("line-copilot-ai-context-preview");
      const expanded = event.currentTarget.getAttribute("aria-expanded") === "true";
      event.currentTarget.setAttribute("aria-expanded", String(!expanded));
      event.currentTarget.textContent = expanded ? "展開預覽" : "收合預覽";
      if (preview) preview.hidden = expanded;
    });
    getElement("line-copilot-ai-generate")?.addEventListener("click", () =>
      generateSuggestion(false)
    );
    getElement("line-copilot-ai-regenerate")?.addEventListener("click", () =>
      generateSuggestion(true)
    );
    getElement("line-copilot-ai-clear")?.addEventListener("click", clearSuggestion);
    getElement("line-copilot-ai-copy")?.addEventListener("click", copySuggestion);
    updateQuestionUi();
    updateChatState(runtime.getLatestChat?.() || {});
  }

  function updateChatState(state) {
    copilotState.currentChat = normalizeChatState(state);
    renderContextPreview();
  }

  globalThis.LINE_COPILOT_AI = Object.freeze({
    createSectionMarkup,
    init,
    updateChatState,
    selectVisibleMessages,
    buildPayload,
    getState: () => copilotState
  });
})();
