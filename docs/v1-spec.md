# LINE COPILOT v1.4 規格

## 產品定位

LINE COPILOT 是 LINE OA 人工客服的右側操作面板。v1.4 專注 UI、UX 與資訊層級，讓主要客服工作在第一屏完成，技術診斷按需展開。

## 目標

- 客服在 3 秒內知道目前客戶、最近問題與主要 CTA。
- AI 建議回覆成為主功能。
- 技術資訊退出主畫面。
- 保留 v1.2 聊天偵測、v1.3 API Client、MLM 本機知識模式與 Mock 測試流程。
- 不改變 LINE OA，不自動發送。

## 面板資訊架構

1. Header：LINE COPILOT／AI 客服助手／收合。
2. 客戶摘要：名稱、狀態、最近客戶訊息、上下文數量。
3. 快速操作：六個 pill buttons，只填入需求。
4. AI 建議輸入：2000 字、context checkbox、對話預覽、主要 CTA。
5. 結果卡片：建議、時間、上下文、複製與調整。
6. 客戶與聊天室資訊：預設收合。
7. 開發與偵錯資訊：預設收合。
8. Footer：隱私、開發入口、版本。

## 模組責任

### `copilot-panel.js`

- 建立 Header、客戶摘要、快速操作容器、折疊資訊與精簡 footer。
- 更新摘要與聊天室資訊。
- 管理收合／展開、隱私提示及偵錯入口。

### `ai-suggestion.js`

- 問題驗證與剩餘字數。
- 快速指令填入。
- 對話選擇與一般預覽。
- loading、可關閉錯誤、空白狀態。
- 產生、複製、重新產生、更親切、更簡短、清除。
- 切換聊天室時清除舊結果但保留未送出輸入。
- 將 request／response 技術資料寫入偵錯區。

### `content.js`

- 保留聊天對象與可見訊息偵測。
- 更新候選、排除與角色診斷資料。
- 協調 `LINE_COPILOT_PANEL` 與 `LINE_COPILOT_AI`。
- 不再包含整份面板 HTML。

### `api-client.js`

- 保留 MLM 本機知識檢索、Mock fallback 與正式 API Client。
- timeout、AbortController、HTTP／JSON／網路錯誤處理。

## 快速操作

快捷指令只更新 textarea，不呼叫 API。loading 期間全部停用。最近一次選擇以 active pill 顯示，面板收合不會清除。

## 結果調整

- 更親切：原需求後加入「請將剛才的建議調整得更親切自然。」
- 更簡短：原需求後加入「請將剛才的建議縮短，保留最重要資訊。」

兩者均再次呼叫 `requestAiSuggestion`，仍不會寫入或送出 LINE 訊息。

## 聊天室切換狀態

聊天室 identity 依 conversation ID、contact name 或 URL 建立。identity 改變且已有結果時：

1. Abort 尚未完成的舊 request。
2. 清除舊 result、requestId 與 mode badge。
3. 保留 textarea、checkbox 偏好、快捷指令與 details open state。
4. 顯示重新產生提示。

## 無聊天室狀態

- `isOpen = false`。
- context checkbox disabled 且不帶入訊息。
- payload 的 `contactName`、`conversationId` 為 `null`。
- `visibleMessages` 為 `[]`。
- 手動問題仍能產生建議。

## 技術資訊位置

聊天室 ID、完整網址、偵測來源、confidence、候選元素、排除原因、payload、response metadata、requestId、model、usage 與 Mock 狀態只存在於兩個預設收合區，不顯示在客戶摘要或結果主內容。

## 視覺規格

- 面板寬度 400px。
- Header 與 footer 固定，中間內容獨立捲動。
- 卡片白底、淡灰框、14px 圓角。
- LINE 綠只用於主要 CTA、狀態與選取提示。
- 結果最大高度 300px，超出內捲動。
- 所有 selector 使用 `line-copilot-` 前綴，沒有全域 element selector。

## 安全邊界

- 不讀 LINE OA Cookie、LINE Token、localStorage 或既有 Authorization Header。
- MLM 短效 Token 由客服主動登入取得，只存在目前分頁記憶體，重新整理即清除。
- 不使用 Chrome Storage。
- 不攔截 LINE OA request。
- 不呼叫 Messaging、Push 或 Reply API。
- 不修改原生輸入框、不自動點擊、不自動發送。
- 不在一般畫面或 Console 顯示完整 request 技術資料。

## Manifest

- `manifest_version`: 3
- `version`: 1.5.0
- Script order：`config.js`、`api-client.js`、`customer-integration.js`、`ai-suggestion.js`、`copilot-panel.js`、`content.js`
- Host permissions 僅包含 MLM raw knowledge 與 `mlm.fangwl591021.workers.dev` 客戶／K 點 API。

## 測試

自動測試覆蓋第一屏、快捷指令、Mock 結果、複製、兩種結果調整、清除、切換聊天室、無聊天室、狀態保持、折疊資訊、長結果捲動、單一面板與 LINE 原生 UI 不受影響。v1.4.1 另加入側欄／全螢幕切換與 Esc 返回；切換僅變更 Extension 根節點 class，不重建內容。

人工清單見 [v1.4-test-checklist.md](v1.4-test-checklist.md)。

## 已知限制

- 正式生成式 AI API 尚未配置。
- MLM 模式是本機檢索，不是語意向量搜尋。
- LINE OA DOM 變更可能需要更新 detector。
- 不支援手機版。

## 操作截圖

> 預留：v1.4 第一屏與建議結果卡片。

## 下一版本

- 自有後端 RAG／AI 建議。
- 登入、權限與使用額度。
- 可管理的企業知識庫。
- 回覆品質回饋與人工採用紀錄。

## v1.5 客戶資料與 K 點整合

- LINE UID：從 `chat.line.biz/.../chat/U...` 網址取得，僅接受 `U` 開頭的合理格式。
- 頭貼：優先使用 MLM thread/profile 的 `pictureUrl`，否則使用聊天室 Header 中與名稱最近的可見 HTTPS 圖片。
- MLM 登入：`POST /api/auth/extension-login`，成功後回傳 HMAC 簽章、8 小時有效的 `lcx1` Token。
- 客戶摘要：`GET /api/copilot/customer` 僅回傳目前 UID、姓名、頭貼、狀態、K 點餘額與解析結果，不回傳聊天歷史或同名候選明細。
- K 點異動：沿用 `/admin/points/grant` 與 `/admin/points/deduct`；Token、客服樓層權限、來源 UID 與既有 Worker 規則都必須通過。
- 康立全球不可贈點；未對應會員、數量無效、未填原因或未通過確認時不送出。
- Extension background 僅代理白名單端點，不允許任意 MLM URL。

## v1.5 隱私與安全

- 不把帳號密碼、Token、K 點資料寫入 localStorage、Chrome Storage 或後端診斷報告。
- 密碼只用於一次登入 request，成功後立即清空輸入框。
- Token 不輸出到 Console，也不放入頁面 DOM。
- 不讀取或轉送 LINE OA Cookie、access token、Authorization header。
- K 點異動由客服人工觸發並再次確認，不會因聊天室切換自動執行。
