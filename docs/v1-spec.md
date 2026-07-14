# LINE COPILOT v1.3.1 規格

## 產品定位

LINE COPILOT 是 LINE Official Account Manager 的人工客服輔助面板。v1.3 將已偵測的聊天室資訊與客服手動輸入的問題組合成一次性 API Request，顯示後端產生的建議回覆，由客服人工確認與複製。

它不是 LINE 訊息發送器，也不是自動回覆機器人。

## v1.3 目標

- 建立可替換後端的統一 API Client。
- 預設從 MLM Repository 下載公開知識庫並在瀏覽器本機比對。
- 保留 Mock API 與正式後端 API 路徑。
- 讓客服明確控制是否帶入最近可見訊息。
- 僅在主動點擊後傳送必要資料。
- 為未來登入、額度、方案與知識庫保留狀態結構。

## 模組責任

### `config.js`

集中管理 `USE_MLM_KNOWLEDGE`、`MLM_KNOWLEDGE_URL`、`API_BASE_URL`、`USE_MOCK_API`、`REQUEST_TIMEOUT_MS`、`MAX_VISIBLE_MESSAGES`。不得存放 API Key。

### `api-client.js`

- `requestAiSuggestion(payload, options)`
- MLM 知識庫本機檢索與建議組合
- Mock response
- 正式 API 的 `fetch` 與 JSON request
- 30 秒 timeout
- `AbortController`
- HTTP 與網路錯誤轉換
- Response schema 基本驗證

### `ai-suggestion.js`

- AI 區塊 markup 與事件
- 問題驗證及字數顯示
- 上下文選擇與預覽
- Payload 組合
- loading、error、result
- 重新產生、清除與複製 fallback
- v1.3 狀態容器

### `content.js`

保留 v1.2 聊天偵測與面板生命週期，將最新聊天狀態交給 AI 模組；不負責 API 細節。

## 狀態

```js
const copilotState = {
  auth: {
    loggedIn: false,
    plan: "free"
  },
  usage: {
    remaining: null
  },
  currentChat: {},
  aiRequest: {
    loading: false,
    lastRequestId: null
  }
};
```

v1.3 不實作登入、額度或付費解鎖。

## 上下文規則

1. 使用 v1.2 已清理的可見文字訊息。
2. 空白訊息不使用。
3. 最多取最後 5 則。
4. 優先使用 high／medium confidence。
5. 只有完全沒有 high／medium 時才使用 low confidence。
6. 使用者取消 checkbox 時傳送空陣列。
7. 預覽不觸發 API，不會在背景上傳。

訊息格式：

```json
{
  "text": "string",
  "role": "customer | operator | system | unknown",
  "time": "string | null",
  "confidence": "high | medium | low"
}
```

## API Contract

Endpoint：`POST {API_BASE_URL}/api/copilot/suggest`

Request：

```json
{
  "question": "string",
  "contactName": "string | null",
  "conversationId": "string | null",
  "currentUrl": "string",
  "visibleMessages": [],
  "source": "chrome-extension",
  "extensionVersion": "1.3.1",
  "instructions": {
    "language": "zh-TW",
    "replyMode": "suggestion-only",
    "mustBeReviewedByHuman": true,
    "doNotAutoSend": true
  }
}
```

成功 Response：

```json
{
  "success": true,
  "suggestion": "string",
  "requestId": "string",
  "model": "string",
  "createdAt": "ISO-8601 datetime",
  "usage": {
    "inputTokens": 0,
    "outputTokens": 0
  }
}
```

失敗 Response：

```json
{
  "success": false,
  "error": {
    "code": "string",
    "message": "string"
  }
}
```

## 錯誤顯示

| 條件 | 使用者訊息 |
|---|---|
| 空白問題 | 請先輸入問題 |
| 未設定 API | 尚未設定 LINE COPILOT API |
| 網路失敗 | 無法連線到 LINE COPILOT 服務，請檢查網路後再試一次 |
| Timeout | AI 回覆逾時，請稍後再試 |
| 401 | 登入狀態已失效，請重新登入 |
| 403 | 目前帳號沒有使用此功能的權限 |
| 429 | 今日使用次數已達上限 |
| 500+ | LINE COPILOT 服務暫時異常，請稍後再試 |
| 空 suggestion | AI 沒有產生可用的建議，請重新嘗試 |
| 複製失敗 | 選取建議文字，提示使用者按 Ctrl+C |

## 安全邊界

- 不讀取 Cookie、localStorage、Authorization Header 或 LINE Token。
- 不攔截 LINE OA requests。
- 不呼叫 LINE Messaging API、Push API、Reply API。
- 不修改原生聊天輸入框，不自動點擊。
- 不保存完整聊天紀錄。
- 不在 Console 輸出 payload 或對話全文。
- MLM 模式只下載公開知識庫，不上傳問題或聊天內容。
- Mock fallback 不執行外部 `fetch`。
- 正式模式只能配置自有後端來源，Manifest 不使用 `<all_urls>`。
- AI 建議必須由人工確認與手動貼上。

## Manifest

- `manifest_version`: 3
- `version`: 1.3.1
- Script order：`config.js`、`api-client.js`、`ai-suggestion.js`、`content.js`
- `host_permissions` 僅允許 MLM Repository 的 raw content 精確來源
- 不要求 `tabs`、`cookies`、`webRequest` 或 storage 權限

## 測試方式

詳細案例見 [v1.3-test-checklist.md](v1.3-test-checklist.md)。自動 fixture 驗證 Mock 工作流程、上下文開關、重複請求防護、複製、清除、重新產生、聊天室切換、未開啟聊天室、HTTP 錯誤、timeout 與不自動操作 LINE UI。

## 已知限制

- 正式生成式 AI API 尚未配置；目前是 MLM 知識庫檢索式建議。
- GitHub 或 MLM Repository 無法連線時，知識庫模式會顯示載入失敗。
- LINE OA DOM 更新可能影響聊天室偵測。
- 只帶入目前已渲染且可見的文字訊息。
- 不支援手機版。
- API instructions 由後端決定是否採用；Extension 不內嵌完整 system prompt。

## 不包含功能

- 登入、付費方案、免費額度
- 工作空間、企業知識庫、CRM
- RAG
- 自動回覆、自動傳送 LINE 訊息

## 下一版本

- v1.4：登入與帳號綁定
- v1.5：免費額度與方案權限
- v2.0：企業知識庫與 AI RAG
