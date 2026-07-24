# LINEPILOT 免費版

LINEPILOT 是顯示在 LINE Official Account Manager 右側的 Chrome 擴充功能客服工作台。

## 免費版範圍

- 不串接 LINE Messaging API。
- 不需要 Channel Secret、Access Token 或 Webhook。
- 安裝後必須完成 LINEPILOT 帳號註冊，立即啟用免費方案。
- 只讀取目前畫面上已顯示的最近 5 則文字對話。
- 從 LINEPILOT SaaS 下載使用者自己的知識庫，於瀏覽器本機比對。
- 建議回覆只供人工確認與複製，不修改 LINE 輸入框、不自動發送訊息。
- 免費方案最多 100 筆知識。

## 三段式介面

1. 懸浮圖示：不占用 LINE OA 工作空間。
2. 右側面板：顯示目前聊天、快捷需求與建議回覆。
3. 全螢幕三欄：客戶／對話、問題與知識、建議回覆。

## 測試安裝

1. 下載此分支。
2. 開啟 `chrome://extensions`。
3. 開啟「開發人員模式」。
4. 點擊「載入未封裝項目」。
5. 選擇 `extension` 資料夾。
6. 點擊 LINEPILOT 圖示完成免費註冊。
7. 前往 `https://manager.line.biz/` 並開啟聊天室。

## 平台

- SaaS：`https://line-oa.fangwl591021.workers.dev/`
- API：帳號、登入、免費方案與個人知識庫
- 後台介面：採用 `fangwl591021/action` 的 actionadmin 左側導覽規格

## 安全界線

- 不讀取 LINE OA Cookie、Token、localStorage 或既有 Authorization Header。
- 不主動捲動或載入完整歷史訊息。
- 不保存 LINE 聊天內容。
- 知識庫由登入使用者主動建立並儲存在 LINEPILOT SaaS。
- Extension Token 僅用於 LINEPILOT 平台，不是 LINE Token。
- 所有建議都必須由使用者人工確認。
