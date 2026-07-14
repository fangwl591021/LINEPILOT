(() => {
  "use strict";

  const MOCK_SUGGESTION =
    "您好，感謝您的詢問。以下是根據目前資訊整理的建議回覆，請客服確認內容後再傳送給客戶。";
  const MLM_MESSAGE_TYPE = "LINE_COPILOT_FETCH_MLM_KNOWLEDGE";
  const MLM_STOP_WORDS = new Set([
    "請幫我", "幫我", "請問", "回覆", "客戶", "整理", "問題", "建議", "內容", "一下", "目前", "可以"
  ]);
  const MLM_INTENT_TERMS = [
    "功能", "功效", "作用", "防藍光", "抗紫外線", "材質", "成分", "適用", "族群", "價格", "費用",
    "購買", "保固", "使用", "多久", "怎麼", "差別", "不同", "制度", "獎金", "退貨", "退款"
  ];

  class LineCopilotApiError extends Error {
    constructor(code, message, status = null) {
      super(message);
      this.name = "LineCopilotApiError";
      this.code = code;
      this.status = status;
    }
  }

  function getConfig() {
    return globalThis.LINE_COPILOT_CONFIG || {};
  }

  function mapHttpError(status) {
    if (status === 401) {
      return new LineCopilotApiError("UNAUTHORIZED", "登入狀態已失效，請重新登入", status);
    }
    if (status === 403) {
      return new LineCopilotApiError(
        "FORBIDDEN",
        "目前帳號沒有使用此功能的權限",
        status
      );
    }
    if (status === 429) {
      return new LineCopilotApiError("RATE_LIMITED", "今日使用次數已達上限", status);
    }
    if (status >= 500) {
      return new LineCopilotApiError(
        "SERVICE_UNAVAILABLE",
        "LINE COPILOT 服務暫時異常，請稍後再試",
        status
      );
    }
    return new LineCopilotApiError(
      "REQUEST_FAILED",
      "LINE COPILOT 無法處理本次請求，請稍後再試",
      status
    );
  }

  function waitWithAbort(delay, signal) {
    return new Promise((resolve, reject) => {
      const timerId = setTimeout(resolve, delay);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timerId);
          reject(signal.reason || new DOMException("Aborted", "AbortError"));
        },
        { once: true }
      );
    });
  }

  async function parseJsonResponse(response) {
    const text = await response.text();
    if (!text) {
      throw new LineCopilotApiError(
        "INVALID_RESPONSE",
        "LINE COPILOT 服務回傳格式不正確，請稍後再試",
        response.status
      );
    }
    try {
      return JSON.parse(text);
    } catch (_error) {
      throw new LineCopilotApiError(
        "INVALID_JSON",
        "LINE COPILOT 服務回傳格式不正確，請稍後再試",
        response.status
      );
    }
  }

  function normalizeKnowledgeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[\s,，。！？!?、/\\\-_:：;；()[\]{}「」『』【】《》〈〉.．]+/g, "");
  }

  function knowledgeTerms(value) {
    const normalized = normalizeKnowledgeText(value);
    const terms = new Set();
    if (normalized.length >= 2) {
      for (let size = Math.min(6, normalized.length); size >= 2; size -= 1) {
        for (let index = 0; index <= normalized.length - size; index += 1) {
          const term = normalized.slice(index, index + size);
          if (!MLM_STOP_WORDS.has(term)) terms.add(term);
        }
      }
    }
    return [...terms].slice(0, 180);
  }

  function findMlmKnowledgeMatches(payload, items) {
    const context = (payload.visibleMessages || [])
      .filter((message) => message && ["customer", "unknown"].includes(message.role))
      .map((message) => message.text)
      .join(" ");
    const queryText = [payload.question || "", context].join(" ").trim();
    const normalizedQuery = normalizeKnowledgeText(queryText);
    const terms = knowledgeTerms(queryText);

    return (items || [])
      .map((item) => {
        const category = String(item?.category || "").trim();
        const question = String(item?.question || "").trim();
        const answer = String(item?.answer || "").trim();
        if (!question || !answer) return null;
        const questionText = normalizeKnowledgeText(question);
        const categoryText = normalizeKnowledgeText(category);
        const allText = normalizeKnowledgeText([category, question, answer].join(" "));
        let score = 0;
        for (const intent of MLM_INTENT_TERMS) {
          if (!normalizedQuery.includes(intent)) continue;
          if (questionText.includes(intent)) score += 55;
          else if (categoryText.includes(intent)) score += 35;
          else if (allText.includes(intent)) score += 45;
        }
        for (const term of terms) {
          if (questionText.includes(term)) score += Math.min(term.length * 3, 18);
          else if (categoryText.includes(term)) score += Math.min(term.length * 2, 12);
          else if (allText.includes(term)) score += Math.min(term.length, 6);
        }
        if (normalizedQuery && questionText && normalizedQuery.includes(questionText)) score += 40;
        return { category, question, answer, score };
      })
      .filter((item) => item && item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      globalThis.chrome.runtime.sendMessage(message, (response) => {
        const error = globalThis.chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(response);
      });
    });
  }

  async function requestMlmKnowledgeSuggestion(payload, config) {
    let response;
    try {
      response = await sendRuntimeMessage({
        type: MLM_MESSAGE_TYPE,
        url: String(config.MLM_KNOWLEDGE_URL || "")
      });
    } catch (_error) {
      throw new LineCopilotApiError(
        "MLM_KNOWLEDGE_UNAVAILABLE",
        "無法載入 MLM 知識庫，請稍後再試"
      );
    }
    if (!response?.ok || !Array.isArray(response.items)) {
      throw new LineCopilotApiError(
        "MLM_KNOWLEDGE_UNAVAILABLE",
        response?.error || "無法載入 MLM 知識庫，請稍後再試"
      );
    }

    const matches = findMlmKnowledgeMatches(payload, response.items);
    const suggestion = matches.length
      ? "您好，關於「" + matches[0].question + "」，" + matches[0].answer
      : "目前在 MLM 知識庫中尚未找到足夠接近的資料，建議由客服確認後再回覆客戶。";
    return {
      success: true,
      suggestion,
      requestId: "mlm-local-" + Date.now(),
      model: "mlm-knowledge-local",
      source: "MLM/data/knowledge-base.json",
      createdAt: new Date().toISOString(),
      usage: { inputTokens: 0, outputTokens: 0 },
      knowledgeMatches: matches.map(({ category, question, score }) => ({ category, question, score }))
    };
  }

  async function requestAiSuggestion(payload, options = {}) {
    const config = getConfig();
    const timeoutMs = Number(config.REQUEST_TIMEOUT_MS) || 30000;
    const controller = new AbortController();
    const externalSignal = options.signal;
    let didTimeout = false;
    const abortFromExternal = () => controller.abort(externalSignal.reason);
    if (externalSignal) {
      if (externalSignal.aborted) abortFromExternal();
      else externalSignal.addEventListener("abort", abortFromExternal, { once: true });
    }
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort(new DOMException("Timed out", "TimeoutError"));
    }, timeoutMs);

    try {
      const canUseMlmKnowledge = Boolean(
        config.USE_MLM_KNOWLEDGE &&
          config.MLM_KNOWLEDGE_URL &&
          globalThis.chrome?.runtime?.sendMessage
      );
      if (canUseMlmKnowledge) {
        return await requestMlmKnowledgeSuggestion(payload, config);
      }

      if (config.USE_MOCK_API) {
        await waitWithAbort(800, controller.signal);
        return {
          success: true,
          suggestion: MOCK_SUGGESTION,
          requestId: "mock-request-id",
          model: "mock",
          createdAt: new Date().toISOString(),
          usage: { inputTokens: 0, outputTokens: 0 }
        };
      }

      const baseUrl = String(config.API_BASE_URL || "").trim().replace(/\/$/, "");
      if (!baseUrl) {
        throw new LineCopilotApiError("API_NOT_CONFIGURED", "尚未設定 LINE COPILOT API");
      }

      let response;
      try {
        response = await fetch(`${baseUrl}/api/copilot/suggest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
          referrerPolicy: "no-referrer",
          signal: controller.signal
        });
      } catch (error) {
        if (controller.signal.aborted) throw error;
        throw new LineCopilotApiError(
          "NETWORK_ERROR",
          "無法連線到 LINE COPILOT 服務，請檢查網路後再試一次"
        );
      }

      if (!response.ok) throw mapHttpError(response.status);
      const data = await parseJsonResponse(response);
      if (!data || data.success !== true) {
        const message = data?.error?.message;
        throw new LineCopilotApiError(
          data?.error?.code || "API_ERROR",
          typeof message === "string" && message.trim()
            ? message.trim()
            : "LINE COPILOT 無法處理本次請求，請稍後再試",
          response.status
        );
      }
      if (typeof data.suggestion !== "string" || !data.suggestion.trim()) {
        throw new LineCopilotApiError(
          "EMPTY_SUGGESTION",
          "AI 沒有產生可用的建議，請重新嘗試",
          response.status
        );
      }
      return { ...data, suggestion: data.suggestion.trim() };
    } catch (error) {
      if (error instanceof LineCopilotApiError) throw error;
      if (didTimeout || error?.name === "TimeoutError") {
        throw new LineCopilotApiError("TIMEOUT", "AI 回覆逾時，請稍後再試");
      }
      if (error?.name === "AbortError") {
        throw new LineCopilotApiError("ABORTED", "已取消本次 AI 建議請求");
      }
      throw new LineCopilotApiError(
        "NETWORK_ERROR",
        "無法連線到 LINE COPILOT 服務，請檢查網路後再試一次"
      );
    } finally {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    }
  }

  globalThis.LINE_COPILOT_API = Object.freeze({
    requestAiSuggestion,
    LineCopilotApiError
  });
  globalThis.requestAiSuggestion = requestAiSuggestion;
})();
