# LINE COPILOT

LINE COPILOT 是顯示在 LINE Official Account Manager 右側的 Chrome Extension 客服輔助面板。v1.5 在客服工作台加入客戶頭貼、聊天室 ID 與經 MLM 短效授權的 K 點查詢／人工異動。

建議回覆不會自動填入或送出 LINE。客服必須人工確認、複製並手動貼到 LINE OA。

## 專案狀態

- 版本：**1.5.0**
- 技術：Manifest V3、原生 HTML／CSS／JavaScript
- 面板寬度：側欄 400px；可切換全螢幕三欄工作台
- 預設資料來源：MLM 公開知識庫，本機比對
- 測試模式：保留 Mock API，不需要正式 AI API
- 程式位置：`extension/`

## v1.4 UI 重構

新版資訊層級：

1. 固定 Header
2. 客戶摘要
3. 快速操作
4. AI 建議輸入與產生
5. 建議結果
6. 客戶與聊天室資訊（預設收合）
7. 開發與偵錯資訊（預設收合）
8. 精簡底部操作

第一屏優先顯示聊天對象、聊天室狀態、最近一則客戶訊息、上下文數量、快速操作、需求輸入框與「產生建議回覆」CTA。完整網址、selector、confidence、requestId、model 與 token usage 不出現在一般畫面。

Header 的全螢幕按鈕可將側欄切換為三欄工作台：左欄顯示客戶摘要與次要資訊，中欄處理 AI 需求輸入，右欄顯示建議回覆；點擊返回按鈕或按 Esc 可回到 400px 側欄，輸入與結果狀態不會重建。

## v1.5 客戶資料與 K 點

- 從 LINE OA 聊天室 Header 取得目前客戶頭貼，MLM API 的 `pictureUrl` 可作為較穩定來源。
- 將網址中的 `U...` 標示為聊天室 ID；它不保證等於 K 點來源 OA 的 LINE UID。
- 客服使用既有 MLM 帳號登入後，由 Worker 簽發 8 小時短效 Token。
- Token 只保留在目前分頁的記憶體，不寫入 localStorage、Chrome Storage 或 Extension 原始碼。
- 以聊天室名稱與 Header 頭貼進行唯一會員匹配，再讀取康立智能／康立全球 K 點餘額；同名或無法唯一確認時不猜測。
- 康立智能可贈扣；康立全球維持只能扣點。
- UID 尚未可靠對應母站會員時，面板只顯示狀態並禁止贈扣。
- 每次異動必須填寫原因並通過人工確認；操作仍由 MLM Worker 驗證與記錄。
## 快速操作

提供以下小型快捷按鈕：

- 建議怎麼回
- 回覆更親切
- 回覆更簡短
- 客訴安撫
- 產品說明
- 引導成交

快捷按鈕只會把對應需求填入輸入框，不會自動呼叫 API。客服仍須按下「產生建議回覆」。

## 建議結果卡片

建議成功後顯示：

- 建議回覆文字
- 產生時間
- 已帶入的對話數
- 測試模式標籤（僅 Mock response）
- 複製回覆
- 重新產生
- 更親切
- 更簡短

「更親切」與「更簡短」會在原需求後加入調整指令，再次呼叫相同 API Client。結果文字最大高度為 300px，超過時在卡片內捲動。

## 客戶與聊天室資訊

預設收合，展開後才顯示：

- 聊天對象
- 聊天室是否開啟
- 最近訊息數量
- 最後偵測時間
- 聊天室 ID（不等同 K 點來源 UID）
- 目前網址
- 偵測來源與信心程度

## 開發與偵錯資訊

預設收合，包含訊息／名稱候選、排除原因、角色證據、Header 候選、request payload、response metadata、requestId、model、usage、Mock 狀態及診斷 JSON 匯出工具。

## 切換聊天室

切換聊天對象後：

- 客戶摘要與對話預覽立即更新。
- 尚未送出的輸入內容、checkbox、快捷選擇與折疊狀態保留。
- 舊的建議結果自動清除。
- 顯示「已切換聊天對象，請重新產生建議」。

這可避免客服把上一位客戶的建議誤認成目前客戶的結果。

## 無聊天室狀態

未選擇聊天室時仍可手動輸入問題：

- 客戶摘要顯示「尚未選擇聊天室」。
- 上下文 checkbox 自動停用。
- `contactName`、`conversationId` 為 `null`。
- `visibleMessages` 為空陣列。

## 程式架構

```text
extension/
├─ manifest.json
├─ background.js
├─ config.js
├─ api-client.js
├─ ai-suggestion.js   # 輸入、快捷指令、loading、結果與錯誤
├─ copilot-panel.js   # Header、摘要、折疊區與面板生命週期
├─ content.js         # 聊天偵測與模組協調
├─ styles.css
├─ accuracy.css
├─ popup.html
└─ popup.js
```

載入順序：

```text
config.js → api-client.js → ai-suggestion.js → copilot-panel.js → content.js
```

## 安裝方式

1. 開啟 `chrome://extensions`。
2. 開啟「開發人員模式」。
3. 點擊「載入未封裝項目」。
4. 選擇本專案的 `extension` 資料夾。
5. 確認版本為 `1.5.0`。
6. 開啟 `https://manager.line.biz/` 並進入聊天頁面。

更新程式後，先重新載入 Extension，再用 `Ctrl + Shift + R` 重新整理 LINE OA。

## MLM 與 Mock 模式

目前 `config.js` 保留：

- `USE_MLM_KNOWLEDGE: true`：下載 MLM 公開知識庫，在瀏覽器本機比對。
- `USE_MOCK_API: true`：供自動測試或沒有 Extension Runtime 的環境使用。
- `API_BASE_URL: ""`：尚未配置正式 AI API。
- `MLM_API_BASE_URL`：MLM 客戶資料與 K 點 API；實際呼叫由 background service worker 代理。

Extension 不包含任何 AI API Key，也不直接呼叫 OpenAI、Gemini 或 LINE Messaging API。

## 安全與隱私

- 不讀取 LINE OA Cookie、LINE Token、localStorage 或既有 Authorization Header。
- 不保存完整聊天紀錄，不使用 Chrome Storage；MLM 短效 Token 僅存在目前分頁記憶體。
- 不修改 LINE OA 原生輸入框。
- 不點擊 LINE OA 原生傳送按鈕。
- 不使用 LINE Push API 或 Reply API。
- 不自動發送任何訊息。
- MLM 知識庫仍在本機比對；客戶與 K 點資料只在客服主動登入後，透過限定端點讀取。
- 所有建議都必須由客服人工確認。

## 尚未包含

- 登入與帳號綁定
- 免費額度與付費方案
- 正式生成式 AI API
- 自動回覆或自動發送 LINE 訊息
- 手機版支援

## 操作截圖

> 預留：v1.4 客戶摘要、快速操作與建議結果卡片截圖。

## 測試

完整人工驗收請參閱 [docs/v1.5-test-checklist.md](docs/v1.5-test-checklist.md)。

## 已知限制

- LINE OA DOM 更新後，聊天室 selector 與評分策略可能需要調整。
- 只讀取目前已渲染、可見的文字訊息，不主動捲動。
- MLM 本機模式是知識庫檢索式建議，不是生成式 AI 改寫。
- 正式生成式 AI API尚未配置。
- MLM Worker 必須先部署 v1.5 客戶端點，Extension 的 K 點登入才會生效。

## 下一步建議

在自有後端建立 `/api/copilot/suggest`，先檢索 MLM 知識，再由後端 AI 產生有引用依據的客服草稿；Extension 維持只顯示建議與人工複製，不持有 AI Provider Key。
