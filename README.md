# LINE COPILOT

LINE COPILOT 是在 LINE Official Account Manager 右側顯示的 Chrome Extension 面板。v1.2 聚焦「聊天室偵測精準化」：只讀取目前畫面中已顯示的 DOM，辨識聊天室名稱與最近五則真正的文字訊息，並以保守規則判斷訊息角色。

## 專案狀態

目前版本為 **v1.2.0**。所有程式位於 `extension/`，使用 Manifest V3 與原生 HTML、CSS、JavaScript，不依賴 MLM Repository。

本版本不呼叫外部 API、不串接 AI、不發送 LINE 訊息、不修改 LINE OA 原生輸入框、不自動捲動或點擊，也不把偵測資料寫入任何儲存空間。

## v1.2 功能

- 優先從中央聊天室 header 與頭像鄰近位置取得聊天對象名稱；即使 LINE 使用無語意的雜湊 class，也可用頂部位置、字型與頭像幾何 fallback，並排除日期、時間、操作按鈕及系統文字。
- 僅從已辨識的訊息串及獨立訊息節點擷取文字；若沒有 message 語意 class，會保守辨識中央可捲動區與具有背景、圓角或左右排列證據的視覺泡泡。
- 排除 Rich Menu、圖文選單、卡片操作、圖片、導覽按鈕、日期分隔線、已讀及系統操作提示。
- 依 DOM 方向語意、排列、頭像與水平位置綜合判斷 `customer`、`operator`、`system` 或 `unknown`，並顯示 high、medium 或 low confidence。
- 優先解析 `chat.line.biz/{accountId}/chat/{conversationId}` 的 `/chat/` 後段聊天室 ID。
- 監聽 SPA URL、History API、瀏覽器返回/前進與 DOM 更新，500ms debounce 後重新偵測，並快取仍有效的訊息串以避免重複全頁掃描。
- 偵錯模式列出名稱候選評分、角色依據及被排除候選。
- 使用者點擊「匯出偵測報告」後，僅將明確欄位的 JSON 複製到剪貼簿，不自動上傳。

## Chrome 開發者模式安裝

1. 開啟 `chrome://extensions`。
2. 開啟「開發人員模式」。
3. 點擊「載入未封裝項目」。
4. 選擇本專案的 `extension` 資料夾。
5. 確認 LINE COPILOT 顯示版本 `1.2.0`。
6. 開啟 [https://manager.line.biz/](https://manager.line.biz/)，再進入聊天頁面。

程式更新後，請先在 `chrome://extensions` 點擊 LINE COPILOT 的重新載入，再重新整理 LINE OA 頁面。

## v1.2 測試檢查清單

- [ ] 聊天室頂部顯示 Tonyfang 時，名稱不會被「今天」取代。
- [ ] 一般純文字客戶訊息顯示「客戶」及 confidence。
- [ ] 客服送出的文字訊息顯示「客服」及 confidence。
- [ ] 圖片訊息不會把圖片內文字當成對話文字。
- [ ] Rich Menu、圖文選單及卡片按鈕不出現在正式訊息列表。
- [ ] 日期、已讀、自動回應與手動聊天提示不出現在正式訊息列表。
- [ ] 無法可靠判斷角色的訊息顯示「未知」，不會預設為客戶。
- [ ] 切換不同聊天對象後，名稱、網址、聊天室 ID 與訊息會更新且面板只有一個。
- [ ] 同一聊天室新增可見訊息後，約 0.5 至 1.5 秒內更新。
- [ ] 未開啟聊天室時顯示「尚未偵測到」。
- [ ] 展開偵錯資訊可看到名稱評分、角色依據與排除原因。
- [ ] 匯出 JSON 只複製到剪貼簿，且不含 cookie、token、storage 或 Authorization header。

## 安全與隱私

- v1.2 僅在瀏覽器本機讀取目前已顯示的頁面 DOM。
- 不讀取 cookie、access token、Authorization header、localStorage 或 Chrome Storage。
- 不傳送任何資料、不呼叫外部 API、不串接 AI、不發送 LINE 訊息。
- 診斷報告只有在使用者按下按鈕時才複製到剪貼簿，不會自動上傳。

## 已知限制

- LINE OA 沒有提供穩定的公開聊天室 DOM API；LINE 更新頁面結構後，selector 與評分規則可能需要調整。
- 訊息方向缺少可靠 DOM 線索時會回傳 `unknown`；這是刻意的保守行為。
- 圖片、貼圖、影片與 Rich Menu 不會進入文字訊息列表。
- 只讀取目前已渲染且可見的內容，不會捲動或載入較早訊息。
- 訊息時間若不在同一訊息節點內，會顯示「尚未偵測到」。

完整規格與策略請參閱 [docs/v1-spec.md](docs/v1-spec.md)。


### Header 名稱診斷與備援

- 聊天對象名稱優先由中央聊天室頂部 Header 的位置、字型、頭像距離與語意綜合評分，不依賴單一動態 class。
- 支援合併同一候選父元素內分拆顯示的可見文字，例如 Tony 與 fang 合併為 Tonyfang。
- 聊天室切換後於立即、300ms、800ms、1500ms、3000ms 重試，成功後停止後續重試。
- Header 無可靠候選時，才使用左側已選取或高亮的聊天室主要名稱，來源標記為 selected-chat-list-item。
- 偵錯區最多顯示 30 個 Header 候選元素，並可將不含 Cookie、Token 或 Storage 的 Header 診斷 JSON 複製到剪貼簿。
- LINE OA DOM 或版面更新後，候選區域與評分門檻仍可能需要調整。
