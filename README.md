# LINE COPILOT

LINE COPILOT 是在 LINE Official Account Manager 右側顯示的 Chrome Extension 面板。v1.3 提供「手動輸入問題 → 產生 AI 建議 → 人工確認 → 一鍵複製」工作流程，同時保留 v1.2 的聊天室與可見訊息偵測功能。

AI 建議不會自動填入或送出 LINE 訊息。客服必須自行檢查內容、複製並手動貼到 LINE OA 聊天輸入框。

## 專案狀態

- 版本：**1.3.0**
- Chrome Extension：Manifest V3、原生 HTML／CSS／JavaScript
- 預設 API 模式：Mock，不呼叫外部服務
- 程式位置：`extension/`
- 不依賴 MLM Repository

## v1.3 功能

- 手動輸入最多 2,000 字的問題或整理需求。
- Enter 不送出；可正常輸入多行內容。
- 可選擇是否帶入最近可見的聊天室文字訊息，最多 5 則。
- 優先排除 low confidence 訊息；若沒有其他訊息才使用 low confidence。
- 可在送出前展開預覽本機上下文。
- 使用者主動點擊「產生 AI 建議」後才呼叫統一 API Client。
- 顯示 loading、錯誤、建議內容、產生時間、聊天對象與上下文使用狀態。
- 支援清除、重新產生與一鍵複製。
- Clipboard API 失敗時自動選取建議文字，供使用者按 `Ctrl+C`。
- 面板收合再展開時保留目前輸入與結果。

## 程式架構

```text
extension/
├─ manifest.json
├─ background.js
├─ config.js          # API Base URL、Mock 開關、timeout、上下文上限
├─ api-client.js      # fetch、AbortController、timeout、HTTP 錯誤、Mock API
├─ ai-suggestion.js   # AI 區塊、payload、狀態、loading、結果、複製
├─ content.js         # 聊天偵測、既有面板及各模組啟動
├─ styles.css
├─ accuracy.css
├─ popup.html
├─ popup.js
└─ icons/
```

Manifest 中的內容腳本載入順序為：

```text
config.js → api-client.js → ai-suggestion.js → content.js
```

## Mock API

預設的 [extension/config.js](extension/config.js) 設定如下：

```js
const LINE_COPILOT_CONFIG = {
  API_BASE_URL: "",
  USE_MOCK_API: true,
  REQUEST_TIMEOUT_MS: 30000,
  MAX_VISIBLE_MESSAGES: 5
};
```

`USE_MOCK_API: true` 時不會執行 `fetch`，約 800ms 後回傳固定測試建議。此模式不需要 API Key、Worker 或額外網域權限。

## 正式 API 設定

後端完成後，只在 [extension/config.js](extension/config.js) 修改：

```js
API_BASE_URL: "https://your-worker.example.workers.dev",
USE_MOCK_API: false
```

並在 `extension/manifest.json` 加入該 Worker 的單一來源，例如：

```json
"host_permissions": [
  "https://your-worker.example.workers.dev/*"
]
```

不要加入 `<all_urls>`，也不要把 OpenAI、Gemini 或其他供應商 API Key 放進 Extension。Extension 只應呼叫自己的 LINE COPILOT 後端。

## Request 範例

```json
{
  "question": "請幫我禮貌回覆客戶目前仍有庫存",
  "contactName": "Tonyfang",
  "conversationId": "U1234567890",
  "currentUrl": "https://chat.line.biz/account/chat/U1234567890",
  "visibleMessages": [
    {
      "text": "請問還有庫存嗎？",
      "role": "customer",
      "time": "15:01",
      "confidence": "high"
    }
  ],
  "source": "chrome-extension",
  "extensionVersion": "1.3.0",
  "instructions": {
    "language": "zh-TW",
    "replyMode": "suggestion-only",
    "mustBeReviewedByHuman": true,
    "doNotAutoSend": true
  }
}
```

## Response 範例

成功：

```json
{
  "success": true,
  "suggestion": "您好，目前商品仍有庫存，歡迎您告訴我們需要的數量。",
  "requestId": "req_123",
  "model": "backend-selected-model",
  "createdAt": "2026-07-14T10:00:00.000Z",
  "usage": {
    "inputTokens": 0,
    "outputTokens": 0
  }
}
```

失敗：

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "今日使用次數已達上限"
  }
}
```

## Chrome 開發者模式安裝

1. 開啟 `chrome://extensions`。
2. 開啟「開發人員模式」。
3. 點擊「載入未封裝項目」。
4. 選擇本專案的 `extension` 資料夾。
5. 確認 LINE COPILOT 版本為 `1.3.0`。
6. 開啟 `https://manager.line.biz/` 並進入聊天頁面。

程式更新後，先在 `chrome://extensions` 點擊重新載入，再對 LINE OA 頁面按 `Ctrl + Shift + R`。

## AI 建議測試

1. 保持 `USE_MOCK_API: true`。
2. 開啟聊天室，確認聊天對象與最近可見訊息已更新。
3. 在「AI 建議回覆」輸入至少 2 個字元。
4. 檢查上下文預覽與「已帶入 X 則對話」。
5. 點擊「產生 AI 建議」，確認約 800ms loading 後顯示 Mock 建議。
6. 測試一鍵複製、重新產生與清除。
7. 取消上下文 checkbox，確認顯示帶入 0 則。
8. 未開啟聊天室時，確認仍可用純手動問題產生 Mock 建議。

完整驗收項目請參閱 [docs/v1.3-test-checklist.md](docs/v1.3-test-checklist.md)。

## 安全與隱私

- 不讀取 Cookie、LINE Token、localStorage 或 Authorization Header。
- 不攔截 LINE OA 網路請求。
- 不保存完整聊天紀錄，不寫入 Chrome Storage 或後端。
- 不在 Console 輸出問題、對話或建議全文。
- 只有使用者點擊「產生 AI 建議」時才組合並傳送必要資料。
- 取消「帶入目前聊天室最近訊息」後，`visibleMessages` 為空陣列。
- Mock 模式不傳送任何資料。
- 不呼叫 LINE Messaging API、Push API 或 Reply API。
- 不修改 LINE OA 原生輸入框、不點擊傳送按鈕、不自動發送訊息。
- AI 建議只供參考，送出前必須人工確認。

## 常見錯誤

- **尚未設定 LINE COPILOT API**：`USE_MOCK_API` 已關閉，但 `API_BASE_URL` 為空。
- **無法連線**：確認 Worker URL、網路及 `host_permissions` 是否只加入正確 Worker 來源。
- **AI 回覆逾時**：預設 timeout 為 30 秒，可在 `config.js` 調整。
- **401／403／429／500**：面板會顯示對應的繁體中文訊息。
- **複製失敗**：建議文字會被選取，可按 `Ctrl+C` 手動複製。
- **內容仍是舊版**：重新載入 Extension 並強制重新整理 LINE OA 頁面。

## 本版本不包含

- 帳號登入與帳號綁定
- 免費額度及付費方案
- 工作空間與企業知識庫
- CRM
- 自動回覆或自動發送 LINE 訊息

## 已知限制

- 正式後端尚未設定，預設只提供 Mock 建議。
- LINE OA DOM 並非穩定公開 API，網站更新後偵測策略可能需要調整。
- 只使用目前已渲染的最近可見文字訊息，不主動捲動或載入歷史訊息。
- low confidence 訊息只有在沒有更可靠訊息時才會帶入。
- v1.3 僅支援桌面版 Chrome。

## 下一版本規劃

- v1.4：登入與帳號綁定
- v1.5：免費額度與方案權限
- v2.0：企業知識庫與 AI RAG
