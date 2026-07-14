(() => {
  "use strict";

  const MOCK_SUGGESTION =
    "您好，感謝您的詢問。以下是根據目前資訊整理的建議回覆，請客服確認內容後再傳送給客戶。";

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
