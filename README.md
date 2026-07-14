# LINE COPILOT

LINE COPILOT 是供 LINE Official Account Manager 使用的 Chrome Extension。v1.1 在 `manager.line.biz` 後台與 `chat.line.biz` 聊天室右側顯示獨立、可收合的輔助面板，並在瀏覽器本機偵測目前聊天室及畫面上可見的文字訊息。

## 專案狀態

目前為 **v1.1.0 聊天室偵測版本**。本版本不串接 AI、不呼叫外部 API、不發送 LINE 訊息，也不修改 LINE OA 的輸入框或原生操作。

專案規格請參閱 [docs/v1-spec.md](docs/v1-spec.md)。Chrome Extension 程式均位於 `extension/` 目錄，未與其他 Repository 或 MLM 系統串接。

## v1.1 功能

- 判斷目前是否位於已開啟的 LINE OA 聊天室。
- 顯示目前聊天對象名稱、頁面網址、從網址解析的聊天室識別碼及最後偵測時間。
- 只讀取目前畫面中已顯示的最近 5 則文字訊息，不主動捲動或載入歷史訊息。
- 依 DOM 屬性訊號及畫面位置推測訊息為客戶或客服；無法可靠判斷時顯示 `unknown`。
- 監聽 SPA URL、History API、瀏覽器返回／前進與 DOM 變化，並以 500ms debounce 更新面板。
- 提供可手動展開的偵錯資訊，不在一般模式顯示大量技術內容。
- 面板被 LINE 頁面重新渲染移除時會自動恢復，且不產生重複面板。

## 以 Chrome 開發者模式安裝

1. 在 Chrome 開啟 `chrome://extensions`。
2. 開啟右上角的「開發人員模式」。
3. 點擊「載入未封裝項目」。
4. 選擇本專案的 `extension` 資料夾。
5. 開啟 [https://manager.line.biz/](https://manager.line.biz/)，再進入 `https://chat.line.biz/` 聊天室。

更新程式後，請在 `chrome://extensions` 對 LINE COPILOT 點擊「重新載入」，再重新整理 LINE OA 頁面。

## v1.1 測試方法

- [ ] `chrome://extensions` 顯示 LINE COPILOT `1.1.0`，且沒有 Manifest 錯誤。
- [ ] 未開啟聊天室時顯示「尚未偵測到聊天室」。
- [ ] 開啟聊天室後顯示「已開啟聊天室」、聊天對象、聊天室 ID 與目前網址。
- [ ] 切換不同聊天對象後，面板在約 0.5 至 1.5 秒內更新，且仍只有一個面板。
- [ ] 「最近可見訊息」最多顯示 5 則目前畫面上的文字訊息。
- [ ] 未能可靠判斷發送角色或時間時，分別顯示 `unknown` 或「尚未偵測到」。
- [ ] 點擊「顯示偵錯資訊」可查看候選數量、策略與最近 DOM 更新時間。
- [ ] 不捲動聊天室時，Extension 不會自行捲動或載入更多訊息。
- [ ] 收合、展開、關閉面板及「測試功能」仍可正常操作。
- [ ] LINE OA 原生導覽、輸入框與按鈕仍可正常操作。

## 安全與隱私

- v1.1 只讀取當下已顯示於頁面的 DOM 文字，用於右側面板即時顯示。
- 偵測結果只存在目前頁面的記憶體中，不寫入 `localStorage`、Chrome Storage 或後端。
- 不傳送任何資料，也不呼叫外部 API。
- 不串接 AI，不發送 LINE 訊息。
- 不修改 LINE OA 原生聊天輸入框，也不自動點擊 LINE OA 按鈕。

## 已知限制

- LINE OA 未提供穩定的公開聊天頁 DOM API，因此名稱、訊息角色與時間採多策略推測。
- 聊天室識別碼可從目前 `chat.line.biz` 網址穩定解析；顯示名稱與訊息內容依目前 DOM 結構而定。
- 圖片、貼圖、影片、檔案或未載入的歷史訊息不屬於本版本的文字訊息偵測範圍。
- LINE OA 網頁更新後，selector、屬性訊號或版面位置規則可能需要調整。
- 面板採固定覆蓋顯示，不調整 LINE OA 原頁面寬度；使用者可隨時收合。
