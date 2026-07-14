# LINE COPILOT v1.1 規格

## 產品定位

LINE COPILOT 是顯示於 LINE Official Account Manager 右側的瀏覽器輔助面板。v1.1「聊天室偵測器」只在使用者瀏覽器本機辨識目前聊天室及畫面上已存在的文字內容，作為後續功能研究的安全基礎。

## v1.1 開發目標

- 在 `https://manager.line.biz/*` 與 `https://chat.line.biz/*` 維持單一 LINE COPILOT 面板。
- 偵測目前是否已開啟聊天室及可從頁面取得的基本資料。
- 讀取目前畫面可見的最近 5 則文字訊息，不捲動、不載入更多歷史內容。
- 面對 SPA 導航及 DOM 重新渲染時，以 debounce 更新結果並避免無限迴圈。
- 讓 selector 與判斷策略可透過偵錯模式觀察及後續調整。

## 本版本包含功能

### 聊天室狀態

- 是否已開啟聊天室。
- 聊天對象顯示名稱；找不到時顯示「尚未偵測到」。
- 目前頁面網址。
- 從 `chat.line.biz` 路徑或已知 query parameter 解析的聊天室識別碼。
- 最後偵測時間。

### 可見訊息偵測

- 最多顯示畫面中最近 5 則可見文字訊息。
- 顯示可取得的時間；找不到時顯示「尚未偵測到」。
- 優先依 DOM 的 incoming／outgoing、sender 等屬性訊號判斷客戶或客服。
- 屬性不足時才使用訊息在聊天區域的左右位置推測角色。
- 無法可靠判斷時標記為 `unknown`。

### SPA 監聽

- 包裝目前 isolated world 的 `history.pushState` 與 `history.replaceState`。
- 監聽 `popstate`、`hashchange` 及可用時的 Navigation API。
- 每秒比對一次 URL，補足頁面主世界 History API 可能無法被 isolated world 包裝攔截的情況。
- 使用 MutationObserver 監聽外部 DOM 的 child、文字及有限屬性變化。
- 忽略 LINE COPILOT 面板內自身更新，並使用 500ms debounce 避免過度掃描。

### 偵錯模式

- 候選名稱元素數量。
- 候選訊息元素數量。
- 目前使用中的 URL、名稱、訊息偵測策略名稱。
- 最近一次外部 DOM 更新時間。

## 偵測策略

### 聊天室識別碼

1. 限定 `chat.line.biz` 網域。
2. 先檢查 `conversationId`、`chatId`、`roomId`、`userId` query parameter。
3. 再檢查網址中符合長識別碼格式的 path segment。

### 聊天對象名稱

1. 蒐集可見的 heading、ARIA、title、data-testid 及名稱／個人資料相關元素。
2. 依是否位於聊天標頭可見區、是否具有 name／profile／chat header 訊號進行評分。
3. 若語意候選不足，再使用可見標頭區文字的幾何位置作為 fallback。
4. 排除 LINE 導覽、按鈕、時間、網址及面板自身文字。

### 可見訊息

1. 蒐集具有 message ID、data-testid、direction、sender、message／bubble／talk class 或 listitem 語意的可見元素。
2. 另以聊天內容區內的可見 leaf text 作為 fallback。
3. 排除導覽、表單、面板、不可見或超出目前 viewport／scroll clip 的元素。
4. 依文字、時間及角色去重，按畫面垂直位置排序後取最後 5 則。

## 本版本不包含功能

- 不呼叫 AI 或任何外部 API。
- 不發送 LINE 訊息。
- 不修改 LINE OA 原生輸入框。
- 不自動點擊任何 LINE OA 按鈕。
- 不主動捲動或載入歷史訊息。
- 不儲存資料到 localStorage、Chrome Storage、IndexedDB 或後端。
- 不解析圖片、貼圖、影片、音訊或檔案內容。
- 不與 MLM Repository 或其他系統整合。

## 安裝與測試方式

1. 在 Chrome 開啟 `chrome://extensions`，啟用「開發人員模式」。
2. 載入 `extension/`；若已載入舊版，點擊「重新載入」。
3. 確認版本為 `1.1.0` 且沒有錯誤。
4. 開啟 LINE OA 聊天頁，但先不要選取聊天對象，確認面板顯示未偵測到聊天室。
5. 選取一位聊天對象，確認名稱、URL、聊天室 ID、時間及可見訊息更新。
6. 切換至少三位不同聊天對象，確認結果更新且沒有重複面板。
7. 比對畫面底部可見的文字訊息與面板最近 5 則結果；不要主動捲動。
8. 展開偵錯資訊，記錄候選數量及策略名稱。
9. 測試 History 前進／返回、頁面重新整理、面板收合／展開及面板遭移除後恢復。

## 隱私說明

- Extension 僅從目前頁面 DOM 讀取已呈現的資料。
- 偵測結果只用於當下右側面板，不會保存或傳送。
- 程式不包含 fetch、XMLHttpRequest、WebSocket 或其他外部資料傳輸。

面板固定顯示：「目前僅在瀏覽器本機偵測畫面內容，資料不會傳送到外部伺服器。」

## 已知限制

- LINE OA DOM 並非公開穩定介面；LINE OA 網頁更新後 selector、屬性訊號或幾何規則可能需要調整。
- URL 中的聊天室識別碼最穩定；聊天對象名稱通常可取得，但取決於當下頁面是否已完成渲染。
- 客戶／客服角色若沒有 direction 或 sender 屬性，只能依左右位置推測，無法保證完全可靠。
- 訊息時間不是所有訊息都會顯示；未顯示時只能回報「尚未偵測到」。
- 虛擬清單或未出現在 viewport 的訊息不會被讀取。
- 圖片卡片內文字可能與一般訊息結構不同，本版本不保證能可靠辨識。

## 下一版本規劃

- 依實際 LINE OA DOM 驗證結果調整候選評分與角色判斷。
- 加入使用者手動輸入問題。
- 在明確的隱私與授權邊界下評估 AI 建議 API。
