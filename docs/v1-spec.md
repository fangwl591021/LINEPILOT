# LINE COPILOT v1.2 規格

## 產品定位

LINE COPILOT 是 LINE Official Account Manager 的本機輔助面板。v1.2 先把可見聊天室資料整理成乾淨、可診斷且保守的結構，作為未來人工提問與 AI 建議回覆的基礎；本版本沒有任何 AI 或傳送功能。

## v1.2 開發目標

1. 不再把「今天」等日期或操作文字誤認為聊天對象。
2. 不把 Rich Menu、圖文選單、卡片按鈕或圖片內容誤認為文字訊息。
3. 不預設所有訊息都是客戶；證據不足時輸出 `unknown`。
4. 提供可檢查的候選評分、排除原因、角色依據與本機診斷報告。

## 聊天對象名稱策略

偵測器優先定位中央訊息串，再在訊息串上方、水平重疊的聊天室 header 中尋找名稱。若 LINE 的實際 DOM 沒有可辨識的 header 或 message class，名稱偵測仍可獨立以中央頂部位置、字型、父層排列及左側頭像距離評分，不會因訊息串尚未定位而直接失敗。

候選必須是單行、合理長度、不是網址，也不能完全由數字、日期或時間組成。`今天`、`昨天`、`待處理`、`處理完畢`、`搜尋`、`使用手動聊天`、`自動回應訊息` 等會直接排除。

通過基本規則後，依以下線索加權：

- 位於選定的聊天室 header。
- heading、name/profile/chat/contact 等語意。
- 字型大小與粗細符合標題。
- 與圓形頭像在同一列且距離接近。
- 與訊息串水平位置一致。

偵錯模式會顯示每個候選名稱、分數、證據與最終選擇原因。最高分未達門檻時顯示「尚未偵測到」。

## 真正文字訊息與排除規則

偵測器先以 `role=log/list`、message-list/conversation/timeline 等語意及共同訊息父層評分，選出單一訊息串。若實際頁面只使用無語意的雜湊 class，則以中央位置、可捲動／裁切特徵及可見時間文字定位訊息區。仍會要求訊息具有獨立結構；fallback 只接受有背景圓角、左右排列或 message/bubble 結構證據的視覺泡泡。

擷取時優先讀取候選內的獨立文字節點；不使用整頁最短文字或任意葉節點 fallback。以下候選會排除並記錄原因：

- `button`、`a`、menu、toolbar、導覽與操作區。
- Rich Menu、rich message、imagemap、card、carousel、template、flex message。
- 含互動按鈕但沒有獨立文字泡泡的容器。
- 圖片、影片、貼圖等媒體容器且沒有獨立文字節點。
- 日期分隔線、已讀、傳送、預約傳送、使用手動聊天、自動回應訊息等提示。
- 空白、純時間、純按鈕文字及重複訊息。

正式列表只保留目前可見的最近五則文字訊息；被排除的候選只在偵錯模式顯示。

## 角色判斷

角色只能是 `customer`、`operator`、`system` 或 `unknown`。每則訊息建立以下資料：

```json
{
  "text": "string",
  "role": "customer | operator | system | unknown",
  "time": "string | null",
  "confidence": "high | medium | low",
  "sourceStrategy": "string"
}
```

判斷會綜合：

- `incoming/customer/received` 或 `outgoing/operator/sent` 等 DOM 語意。
- 訊息節點與父層的 `flex` 對齊、margin auto 與 justify-content。
- 訊息是否鄰近客戶頭像。
- 訊息相對於訊息串中心的 bounding rectangle 位置。
- `system/notice/event` 等系統訊息結構。

明確方向或系統語意可得到 high confidence；多個一致的排列/位置證據可得到 medium。只有單一弱線索、左右證據衝突或差距不足時，一律輸出 `unknown` 與 low confidence。偵錯模式列出每則訊息的角色分數與依據。

## SPA 與更新監聽

聊天室 ID 優先解析 `chat.line.biz/{accountId}/chat/{conversationId}` 中 `/chat/` 後方的識別碼，避免誤把前段 LINE OA 帳號 ID 當成聊天室 ID。

監聽 `history.pushState`、`history.replaceState`、`popstate`、`hashchange`、Navigation API（可用時）、URL 輪詢及 `MutationObserver`。變更經 500ms debounce 後重新偵測；已定位且仍可見的訊息串會快取使用，避免反覆全頁掃描。面板本身的 DOM 變化會忽略，避免無限迴圈；面板被移除時會復原且不重複建立。

## 診斷報告

使用者按下「匯出偵測報告」後，擴充功能透過 Clipboard API 複製 JSON，欄位固定為：

- `currentUrl`
- `detectedContactName`
- `contactNameCandidates`
- `conversationId`
- `detectedMessages`
- `excludedCandidates`
- `timestamp`

不讀取或包含 cookie、access token、Authorization header、localStorage、Chrome Storage。報告不會自動上傳。

## 測試方法

1. 在 `chrome://extensions` 重新載入擴充功能，確認版本為 `1.2.0`。
2. 打開 LINE OA 聊天頁面，選擇一個 header 有名稱的聊天室。
3. 驗證一般客戶文字、客服文字及可靠的系統事件角色與 confidence。
4. 驗證圖片、Rich Menu、卡片按鈕、自動回應提示、日期及已讀不在正式列表。
5. 快速切換兩個聊天對象，確認 0.5 至 1.5 秒內更新且只有一個面板。
6. 在同一聊天室收到新訊息，不主動捲動，確認已顯示的新訊息自動更新。
7. 返回未選擇聊天室的頁面，確認顯示「尚未偵測到」。
8. 展開偵錯區檢查候選分數、排除原因及角色依據；點擊匯出並檢查 JSON 欄位。

自動回歸 fixture 另涵蓋上述八類案例、面板復原、重複建立及敏感欄位靜態檢查。

## 隱私與不包含功能

- 不呼叫外部 API、不串接 AI、不發送 LINE 訊息。
- 不修改 LINE OA 原生 DOM 或輸入框，不點擊、不捲動。
- 不儲存偵測資料，不主動載入歷史訊息。
- 只在右側面板顯示目前已渲染 DOM 的偵測結果。

## 已知限制

- LINE OA DOM 並非穩定公開 API；網站更新後 selector、結構評分或角色規則可能需要調整。
- 客製訊息元件若沒有方向、排列或頭像線索，角色會是 `unknown`。
- 客服與客戶泡泡若採完全相同結構且沒有可靠方向屬性，不能只靠文字判斷。
- 媒體、貼圖、圖片與 Rich Menu 刻意不轉成文字。
- 只掃描 viewport 內已顯示節點；虛擬列表未渲染的訊息不可取得。

## 下一版本規劃

- 用更多實際 LINE OA DOM 診斷報告校正 selector 與評分門檻。
- 加入手動輸入問題。
- 在明確同意與隱私邊界下串接 AI 建議 API。
- 維持人工確認後才可能進行任何回覆流程。


### Header 名稱診斷與備援

- 聊天對象名稱優先由中央聊天室頂部 Header 的位置、字型、頭像距離與語意綜合評分，不依賴單一動態 class。
- 支援合併同一候選父元素內分拆顯示的可見文字，例如 Tony 與 fang 合併為 Tonyfang。
- 聊天室切換後於立即、300ms、800ms、1500ms、3000ms 重試，成功後停止後續重試。
- Header 無可靠候選時，才使用左側已選取或高亮的聊天室主要名稱，來源標記為 selected-chat-list-item。
- 偵錯區最多顯示 30 個 Header 候選元素，並可將不含 Cookie、Token 或 Storage 的 Header 診斷 JSON 複製到剪貼簿。
- LINE OA DOM 或版面更新後，候選區域與評分門檻仍可能需要調整。
