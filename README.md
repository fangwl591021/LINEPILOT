# LINE COPILOT

LINE COPILOT 是一個供 LINE Official Account Manager 使用的 Chrome Extension。v1.0 的用途是驗證擴充功能能在 `manager.line.biz` 後台與 `chat.line.biz` 聊天室正常載入，並在頁面右側顯示獨立、可收合的輔助面板。

## 專案狀態

目前為 **v1.0.0 驗證版本**。此版本只提供介面載入與顯示測試，不讀取聊天內容、不串接 AI，也不代替使用者操作 LINE OA。

專案規格請參閱 [docs/v1-spec.md](docs/v1-spec.md)。Chrome Extension 程式均位於 `extension/` 目錄，未與其他 Repository 或 MLM 系統串接。

## 以 Chrome 開發者模式安裝

1. 在 Chrome 開啟 `chrome://extensions`。
2. 開啟右上角的「開發人員模式」。
3. 點擊「載入未封裝項目」。
4. 選擇本專案的 `extension` 資料夾。
5. 開啟 [https://manager.line.biz/](https://manager.line.biz/)，或從後台進入 `https://chat.line.biz/` 聊天室。

更新程式後，請在 `chrome://extensions` 對 LINE COPILOT 點擊重新載入，再重新整理 LINE OA 頁面。

## 測試檢查清單

- [ ] `chrome://extensions` 能成功載入 LINE COPILOT，且未顯示 Manifest 錯誤。
- [ ] 開啟或重新整理 `https://manager.line.biz/` 後，右側出現 LINE COPILOT 面板。
- [ ] 進入 `https://chat.line.biz/` 聊天室後，右側仍會出現 LINE COPILOT 面板。
- [ ] Console 顯示 `LINE COPILOT Loaded`。
- [ ] 面板顯示目前網址，切換 LINE OA 內部頁面後網址會更新。
- [ ] 點擊「測試功能」後，面板顯示 `LINE COPILOT 測試成功`。
- [ ] 點擊收合按鈕或「關閉面板」後，只留下小型浮動按鈕。
- [ ] 點擊浮動按鈕後，面板可再次展開。
- [ ] 重複載入 content script 或 LINE OA 重新渲染時，不會產生多個面板。
- [ ] LINE OA 原有導覽、輸入框與按鈕仍可正常操作。

## 安全與隱私

- v1.0 不讀取聊天內容。
- 不傳送任何資料。
- 不呼叫任何外部 API。
- 不發送 LINE 訊息。
- 不修改 LINE OA 原生聊天輸入框，也不自動點擊 LINE OA 按鈕。
