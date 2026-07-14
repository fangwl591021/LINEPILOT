# LINE COPILOT v1.0 規格

## 產品定位

LINE COPILOT 是顯示於 LINE Official Account Manager 右側的瀏覽器輔助面板。產品未來可在使用者主動操作的前提下提供工作提示與 AI 建議；v1.0 僅建立安全、低干擾的 Chrome Extension 基礎。

## v1.0 開發目標

- 驗證 Manifest V3 Extension 可在 `https://manager.line.biz/*` 後台及 `https://chat.line.biz/*` 聊天室載入。
- 驗證固定式右側面板可正常顯示、收合及展開。
- 驗證面對 LINE OA 的 SPA 導航與重新渲染時，面板仍能維持單一實例。
- 建立後續功能可延伸的原生 HTML、CSS、JavaScript 專案骨架。

## 本版本包含功能

- Manifest V3 設定與最基本的 service worker。
- 僅在 LINE Official Account Manager 的 `manager.line.biz` 與 `chat.line.biz` 網域載入 content script 與樣式。
- 右側固定、全視窗高度、約 340px 寬的 LINE COPILOT 面板。
- 顯示頁面偵測狀態與目前網址。
- 測試功能按鈕及成功訊息。
- 收合、展開與關閉（收合）操作。
- 防止重複建立面板。
- SPA 網址更新偵測，以及面板遭頁面重新渲染移除時的自動恢復。
- 顯示名稱、版本與使用提示的 Extension popup。

## 本版本不包含功能

- 不讀取、解析或儲存 LINE 聊天內容。
- 不讀取或修改 LINE OA 原生聊天輸入框。
- 不呼叫 AI 或其他外部 API。
- 不自動點擊 LINE OA 內任何按鈕。
- 不發送 LINE 訊息。
- 不傳送遙測、分析資料或其他使用者資料。
- 不與 MLM Repository 或其他系統整合。

## 安裝與測試方式

1. 下載或 clone 本 Repository。
2. 在 Chrome 開啟 `chrome://extensions` 並啟用「開發人員模式」。
3. 點擊「載入未封裝項目」，選擇 `extension/` 資料夾。
4. 確認 Extension 清單顯示 `LINE COPILOT 1.0.0` 且沒有錯誤。
5. 開啟或重新整理 `https://manager.line.biz/`，並從後台進入 `https://chat.line.biz/` 聊天室。
6. 確認頁面右側顯示面板，Console 出現 `LINE COPILOT Loaded`。
7. 測試「測試功能」、「收合面板」、「關閉面板」及浮動展開按鈕。
8. 在 LINE OA 內切換頁面，確認目前網址更新且只有一個面板。
9. 重新整理頁面，確認面板再次出現。

## 已知限制

- 僅支援網址符合 `https://manager.line.biz/*` 或 `https://chat.line.biz/*` 的頁面。
- v1.0 不判斷使用者是否已登入，也不判斷目前是否開啟聊天室。
- LINE OA 若調整頁面安全政策或瀏覽器擴充功能限制，可能需要更新載入方式。
- 面板採固定覆蓋顯示，不調整 LINE OA 原頁面寬度；展開時可能遮住頁面最右側約 340px 的內容，使用者可隨時收合。
- `icons/` 目前僅保留圖示放置說明，尚未提供正式圖示。

## 下一版本規劃

- 偵測目前是否開啟聊天室。
- 研究可取得的頁面資訊。
- 加入手動輸入問題。
- 串接 AI 建議 API。
