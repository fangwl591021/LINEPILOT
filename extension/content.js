(() => {
  "use strict";

  const LINE_COPILOT_ROOT_ID = "line-copilot-root";
  const LINE_COPILOT_COLLAPSED_CLASS = "line-copilot-collapsed";
  const LINE_COPILOT_MONITOR_KEY = "__lineCopilotMonitor";
  const LINE_COPILOT_NAVIGATION_EVENT = "line-copilot-navigation";
  const LINE_COPILOT_DEBOUNCE_MS = 500;
  const LINE_COPILOT_EMPTY_VALUE = "尚未偵測到";
  const LINE_COPILOT_MESSAGE_LIMIT = 5;
  const LINE_COPILOT_TIME_PATTERN = /(?:上午|下午)?\s*(?:[01]?\d|2[0-3]):[0-5]\d/;
  const LINE_COPILOT_MESSAGE_SELECTOR = [
    "[data-message-id]",
    "[data-testid*='message' i]",
    "[data-direction]",
    "[data-sender-type]",
    "[class*='message' i]",
    "[class*='bubble' i]",
    "[class*='talk' i]",
    "[role='listitem']"
  ].join(",");

  const lineCopilotRuntime = {
    debounceId: null,
    lastUrl: window.location.href,
    lastDomUpdateAt: LINE_COPILOT_EMPTY_VALUE,
    pendingReason: "initial-load"
  };

  console.log("LINE COPILOT Loaded");

  function lineCopilotSafeRun(label, callback, fallback) {
    try {
      return callback();
    } catch (error) {
      console.warn(`LINE COPILOT ${label} failed`, error);
      return fallback;
    }
  }

  function lineCopilotNormalizeText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[\t\r ]+/g, " ")
      .replace(/\n{2,}/g, "\n")
      .trim();
  }

  function lineCopilotFormatTimestamp(date = new Date()) {
    return lineCopilotSafeRun(
      "format timestamp",
      () =>
        new Intl.DateTimeFormat("zh-TW", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false
        }).format(date),
      date.toISOString()
    );
  }

  function lineCopilotIsElementVisible(element) {
    if (!(element instanceof Element) || element.closest(`#${LINE_COPILOT_ROOT_ID}`)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number.parseFloat(style.opacity || "1") === 0
    ) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (
      rect.width < 1 ||
      rect.height < 1 ||
      rect.bottom <= 0 ||
      rect.top >= window.innerHeight ||
      rect.right <= 0 ||
      rect.left >= window.innerWidth
    ) {
      return false;
    }

    let ancestor = element.parentElement;
    let checkedAncestors = 0;
    while (ancestor && ancestor !== document.body && checkedAncestors < 8) {
      const ancestorStyle = window.getComputedStyle(ancestor);
      const clipsContent = /(auto|scroll|hidden|clip)/.test(
        `${ancestorStyle.overflow} ${ancestorStyle.overflowX} ${ancestorStyle.overflowY}`
      );
      if (clipsContent) {
        const ancestorRect = ancestor.getBoundingClientRect();
        const hasIntersection =
          rect.right > ancestorRect.left &&
          rect.left < ancestorRect.right &&
          rect.bottom > ancestorRect.top &&
          rect.top < ancestorRect.bottom;
        if (!hasIntersection) {
          return false;
        }
      }
      ancestor = ancestor.parentElement;
      checkedAncestors += 1;
    }

    return true;
  }

  function lineCopilotGetSignal(element) {
    const signalParts = [];
    let current = element;
    let depth = 0;

    while (current && current !== document.body && depth < 4) {
      signalParts.push(
        current.id,
        current.className,
        current.getAttribute("data-testid"),
        current.getAttribute("data-direction"),
        current.getAttribute("data-sender-type"),
        current.getAttribute("data-message-type"),
        current.getAttribute("aria-label")
      );
      current = current.parentElement;
      depth += 1;
    }

    return signalParts
      .filter((value) => typeof value === "string")
      .join(" ")
      .toLowerCase();
  }

  function lineCopilotGetUsableRightEdge() {
    const root = document.getElementById(LINE_COPILOT_ROOT_ID);
    const rootRect = root?.getBoundingClientRect();
    return rootRect && rootRect.left > window.innerWidth * 0.55
      ? rootRect.left
      : window.innerWidth;
  }

  function detectConversationId() {
    return lineCopilotSafeRun(
      "conversation id detection",
      () => {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.hostname !== "chat.line.biz") {
          return { value: null, strategy: "url:not-chat-host" };
        }

        const queryKeys = ["conversationId", "chatId", "roomId", "userId"];
        for (const key of queryKeys) {
          const value = currentUrl.searchParams.get(key);
          if (value && /^[A-Za-z0-9_-]{8,}$/.test(value)) {
            return { value, strategy: `url:query-${key}` };
          }
        }

        const ignoredSegments = new Set([
          "chat",
          "account",
          "settings",
          "login",
          "home",
          "list"
        ]);
        const pathSegments = currentUrl.pathname
          .split("/")
          .map((segment) => decodeURIComponent(segment).trim())
          .filter(Boolean);
        const pathCandidate = pathSegments.find(
          (segment) =>
            /^[A-Za-z0-9_-]{12,}$/.test(segment) &&
            !ignoredSegments.has(segment.toLowerCase())
        );

        return pathCandidate
          ? { value: pathCandidate, strategy: "url:path-segment" }
          : { value: null, strategy: "url:no-identifier" };
      },
      { value: null, strategy: "url:error" }
    );
  }

  function lineCopilotIsPlausibleContactName(text) {
    if (!text || text.length > 80 || LINE_COPILOT_TIME_PATTERN.test(text)) {
      return false;
    }

    if (/^\d+$/.test(text) || /https?:\/\//i.test(text)) {
      return false;
    }

    const excludedText = /LINE\s*(Official|COPILOT|VOOM)|聊天室|聊天設定|待處理|處理完畢|搜尋|搜索|傳送|自動回應|使用手動聊天|目前聊天室|目前網址|尚未偵測到/i;
    return !excludedText.test(text);
  }

  function detectContactName() {
    return lineCopilotSafeRun(
      "contact name detection",
      () => {
        const usableRight = lineCopilotGetUsableRightEdge();
        const candidates = [];
        const seenElements = new Set();

        const addCandidate = (element, strategy, baseScore) => {
          if (
            seenElements.has(element) ||
            !lineCopilotIsElementVisible(element) ||
            element.closest("nav,aside")
          ) {
            return;
          }

          seenElements.add(element);
          const rect = element.getBoundingClientRect();
          if (
            rect.top < 60 ||
            rect.top > Math.min(260, window.innerHeight * 0.36) ||
            rect.left < usableRight * 0.2 ||
            rect.right > usableRight
          ) {
            return;
          }

          const attributeText =
            element.getAttribute("aria-label") || element.getAttribute("title") || "";
          const text = lineCopilotNormalizeText(
            element.innerText || element.textContent || attributeText
          ).split("\n")[0];
          if (!lineCopilotIsPlausibleContactName(text)) {
            return;
          }

          const signal = lineCopilotGetSignal(element);
          let score = baseScore;
          if (rect.top >= 75 && rect.top <= 190) score += 28;
          if (rect.left >= usableRight * 0.25) score += 12;
          if (/(contact|profile|user|friend|member|name|title)/.test(signal)) score += 18;
          if (/(chat|conversation|room).*(header|head)|header.*(chat|conversation|room)/.test(signal)) {
            score += 28;
          }
          if (element.matches("h1,h2,h3,[role='heading']")) score += 15;
          if (text.length <= 30) score += 8;

          candidates.push({ element, text, score, strategy, rect });
        };

        const semanticElements = document.querySelectorAll(
          "h1,h2,h3,[role='heading'],[data-testid*='name' i],[data-testid*='title' i],[class*='contact' i],[class*='profile' i],[class*='user-name' i],[class*='chat-title' i],[title],[aria-label]"
        );
        Array.from(semanticElements)
          .slice(0, 700)
          .forEach((element) => addCandidate(element, "name:semantic-and-attribute", 45));

        if (!candidates.some((candidate) => candidate.score >= 80)) {
          const fallbackElements = document.querySelectorAll("body *");
          Array.from(fallbackElements)
            .slice(0, 1800)
            .filter((element) => element.children.length <= 2)
            .forEach((element) => addCandidate(element, "name:visible-header-geometry", 20));
        }

        candidates.sort((left, right) => right.score - left.score);
        const bestCandidate = candidates[0];
        return {
          value: bestCandidate?.text || null,
          strategy: bestCandidate?.strategy || "name:no-candidate",
          candidateCount: candidates.length
        };
      },
      { value: null, strategy: "name:error", candidateCount: 0 }
    );
  }

  function lineCopilotExtractMessageTime(element, rawText) {
    const directMatch = rawText.match(LINE_COPILOT_TIME_PATTERN);
    if (directMatch) {
      return directMatch[0].replace(/\s+/g, " ").trim();
    }

    const nearbyElements = [
      element.previousElementSibling,
      element.nextElementSibling,
      element.parentElement?.querySelector("time,[class*='time' i],[data-testid*='time' i]")
    ].filter(Boolean);

    for (const nearbyElement of nearbyElements) {
      if (!lineCopilotIsElementVisible(nearbyElement)) continue;
      const nearbyText = lineCopilotNormalizeText(
        nearbyElement.innerText || nearbyElement.textContent
      );
      const nearbyMatch = nearbyText.match(LINE_COPILOT_TIME_PATTERN);
      if (nearbyMatch) {
        return nearbyMatch[0].replace(/\s+/g, " ").trim();
      }
    }

    return null;
  }

  function lineCopilotExtractMessageText(rawText) {
    const lines = String(rawText || "")
      .split(/\n+/)
      .map((line) => lineCopilotNormalizeText(line))
      .map((line) => line.replace(LINE_COPILOT_TIME_PATTERN, "").trim())
      .filter(Boolean)
      .filter((line) => !/^(已讀|未讀|傳送|重試|刪除|回覆|客戶|客服)$/i.test(line));
    return lineCopilotNormalizeText(lines.join(" "));
  }

  function lineCopilotIsPlausibleMessageText(text) {
    if (!text || text.length > 500 || text.split("\n").length > 5) {
      return false;
    }

    const excludedText = /LINE\s*(Official|COPILOT)|目前聊天室|最近可見訊息|顯示偵錯資訊|關閉面板|測試功能|使用手動聊天|待處理|處理完畢|搜尋|搜索/i;
    return !excludedText.test(text) && !/^https?:\/\//i.test(text);
  }

  function lineCopilotDetectMessageRole(element, rect, conversationBounds) {
    const signal = lineCopilotGetSignal(element);
    if (/(incoming|received|receive|customer|guest|friend|from-user|left)/.test(signal)) {
      return { role: "customer", strategy: "role:attribute-incoming" };
    }
    if (/(outgoing|sent|send|agent|operator|staff|admin|from-self|mine|owner|right)/.test(signal)) {
      return { role: "agent", strategy: "role:attribute-outgoing" };
    }

    const midpoint = (conversationBounds.left + conversationBounds.right) / 2;
    const margin = (conversationBounds.right - conversationBounds.left) * 0.1;
    const center = rect.left + rect.width / 2;
    if (center < midpoint - margin && rect.width < conversationBounds.width * 0.72) {
      return { role: "customer", strategy: "role:geometry-left" };
    }
    if (center > midpoint + margin && rect.width < conversationBounds.width * 0.72) {
      return { role: "agent", strategy: "role:geometry-right" };
    }

    return { role: "unknown", strategy: "role:unknown" };
  }

  function detectVisibleMessages() {
    return lineCopilotSafeRun(
      "visible message detection",
      () => {
        const usableRight = lineCopilotGetUsableRightEdge();
        const conversationBounds = {
          left: Math.max(220, usableRight * 0.22),
          right: usableRight,
          width: usableRight - Math.max(220, usableRight * 0.22)
        };
        const candidates = [];
        const seenElements = new Set();

        const addMessageCandidate = (element, strategy, baseScore) => {
          if (
            seenElements.has(element) ||
            !lineCopilotIsElementVisible(element) ||
            element.closest("nav,aside,header,footer,form")
          ) {
            return;
          }
          seenElements.add(element);

          const rect = element.getBoundingClientRect();
          if (
            rect.left < conversationBounds.left ||
            rect.right > conversationBounds.right + 2 ||
            rect.top < 105 ||
            rect.bottom > window.innerHeight + 1 ||
            rect.width > conversationBounds.width * 0.9
          ) {
            return;
          }

          const rawText = lineCopilotNormalizeText(element.innerText || element.textContent);
          const text = lineCopilotExtractMessageText(rawText);
          if (!lineCopilotIsPlausibleMessageText(text)) {
            return;
          }

          const time = lineCopilotExtractMessageTime(element, rawText);
          const roleResult = lineCopilotDetectMessageRole(
            element,
            rect,
            conversationBounds
          );
          const signal = lineCopilotGetSignal(element);
          let score = baseScore;
          if (element.hasAttribute("data-message-id")) score += 35;
          if (element.hasAttribute("data-direction")) score += 25;
          if (/(message|bubble|talk)/.test(signal)) score += 18;
          if (time) score += 8;
          if (roleResult.role !== "unknown") score += 8;

          candidates.push({
            element,
            text,
            time: time || LINE_COPILOT_EMPTY_VALUE,
            role: roleResult.role,
            roleStrategy: roleResult.strategy,
            strategy,
            score,
            top: rect.top,
            bottom: rect.bottom
          });
        };

        const structuralElements = document.querySelectorAll(LINE_COPILOT_MESSAGE_SELECTOR);
        Array.from(structuralElements)
          .slice(0, 900)
          .forEach((element) => addMessageCandidate(element, "messages:structural-signals", 45));

        const fallbackElements = document.querySelectorAll("p,span,div");
        Array.from(fallbackElements)
          .slice(0, 2200)
          .filter((element) => element.children.length === 0)
          .forEach((element) => addMessageCandidate(element, "messages:visible-text-geometry", 12));

        const uniqueMessages = new Map();
        candidates.forEach((candidate) => {
          const key = `${candidate.text}\u0000${candidate.time}`;
          const existing = uniqueMessages.get(key);
          if (!existing || candidate.score > existing.score) {
            uniqueMessages.set(key, candidate);
          }
        });

        const sortedMessages = Array.from(uniqueMessages.values()).sort(
          (left, right) => left.bottom - right.bottom || left.top - right.top
        );
        const recentMessages = sortedMessages.slice(-LINE_COPILOT_MESSAGE_LIMIT).map(
          ({ text, time, role, roleStrategy, strategy }) => ({
            text,
            time,
            role,
            roleStrategy,
            strategy
          })
        );
        const strategies = Array.from(
          new Set(recentMessages.map((message) => message.strategy))
        );

        return {
          messages: recentMessages,
          strategy: strategies.join(" + ") || "messages:no-candidate",
          candidateCount: candidates.length
        };
      },
      { messages: [], strategy: "messages:error", candidateCount: 0 }
    );
  }

  function detectChatState() {
    const detectedAt = lineCopilotFormatTimestamp();
    const currentUrl = window.location.href;
    const isChatHost = window.location.hostname === "chat.line.biz";

    if (!isChatHost) {
      return {
        isOpen: false,
        contactName: LINE_COPILOT_EMPTY_VALUE,
        currentUrl,
        conversationId: LINE_COPILOT_EMPTY_VALUE,
        detectedAt,
        messages: [],
        debug: {
          nameCandidateCount: 0,
          messageCandidateCount: 0,
          strategy: "host:manager-page-only",
          lastDomUpdateAt: lineCopilotRuntime.lastDomUpdateAt
        }
      };
    }

    const conversationResult = detectConversationId();
    const contactResult = detectContactName();
    const messagesResult = detectVisibleMessages();
    const isOpen = Boolean(
      conversationResult.value || contactResult.value || messagesResult.messages.length
    );

    return {
      isOpen,
      contactName: contactResult.value || LINE_COPILOT_EMPTY_VALUE,
      currentUrl,
      conversationId: conversationResult.value || LINE_COPILOT_EMPTY_VALUE,
      detectedAt,
      messages: messagesResult.messages,
      debug: {
        nameCandidateCount: contactResult.candidateCount,
        messageCandidateCount: messagesResult.candidateCount,
        strategy: [
          conversationResult.strategy,
          contactResult.strategy,
          messagesResult.strategy
        ].join(" / "),
        lastDomUpdateAt: lineCopilotRuntime.lastDomUpdateAt
      }
    };
  }

  function lineCopilotSetText(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value || LINE_COPILOT_EMPTY_VALUE;
      element.title = value || LINE_COPILOT_EMPTY_VALUE;
    }
  }

  function lineCopilotRoleLabel(role) {
    if (role === "customer") return "客戶";
    if (role === "agent") return "客服";
    return "unknown";
  }

  function lineCopilotRenderMessages(messages) {
    const list = document.getElementById("line-copilot-message-list");
    if (!list) return;

    list.replaceChildren();
    if (!messages.length) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "line-copilot-message-empty";
      emptyItem.textContent = LINE_COPILOT_EMPTY_VALUE;
      list.appendChild(emptyItem);
      return;
    }

    messages.forEach((message) => {
      const item = document.createElement("li");
      item.className = "line-copilot-message-item";

      const meta = document.createElement("div");
      meta.className = "line-copilot-message-meta";

      const role = document.createElement("span");
      role.className = `line-copilot-role line-copilot-role-${message.role}`;
      role.textContent = lineCopilotRoleLabel(message.role);

      const time = document.createElement("time");
      time.className = "line-copilot-message-time";
      time.textContent = message.time;

      const text = document.createElement("p");
      text.className = "line-copilot-message-text";
      text.textContent = message.text;

      meta.append(role, time);
      item.append(meta, text);
      list.appendChild(item);
    });
  }

  function updateCopilotPanel(state) {
    const statusCard = document.getElementById("line-copilot-status-card");
    const statusText = state.isOpen ? "已開啟聊天室" : "尚未偵測到聊天室";
    statusCard?.classList.toggle("line-copilot-status-inactive", !state.isOpen);
    lineCopilotSetText("line-copilot-status-text", statusText);
    lineCopilotSetText(
      "line-copilot-chat-open",
      state.isOpen ? "是" : "尚未偵測到"
    );
    lineCopilotSetText("line-copilot-contact-name", state.contactName);
    lineCopilotSetText("line-copilot-current-url", state.currentUrl);
    lineCopilotSetText("line-copilot-conversation-id", state.conversationId);
    lineCopilotSetText("line-copilot-detected-at", state.detectedAt);
    lineCopilotSetText(
      "line-copilot-debug-name-count",
      String(state.debug.nameCandidateCount)
    );
    lineCopilotSetText(
      "line-copilot-debug-message-count",
      String(state.debug.messageCandidateCount)
    );
    lineCopilotSetText("line-copilot-debug-strategy", state.debug.strategy);
    lineCopilotSetText(
      "line-copilot-debug-dom-time",
      state.debug.lastDomUpdateAt
    );
    lineCopilotRenderMessages(state.messages);
  }

  function lineCopilotSetCollapsed(root, collapsed) {
    root.classList.toggle(LINE_COPILOT_COLLAPSED_CLASS, collapsed);
    root.setAttribute("aria-expanded", String(!collapsed));
  }

  function lineCopilotCreatePanel() {
    const root = document.createElement("aside");
    root.id = LINE_COPILOT_ROOT_ID;
    root.className = "line-copilot-root";
    root.setAttribute("aria-label", "LINE COPILOT 面板");
    root.setAttribute("aria-expanded", "true");

    root.innerHTML = `
      <button id="line-copilot-expand-button" class="line-copilot-expand-button" type="button" aria-label="展開 LINE COPILOT 面板" title="展開 LINE COPILOT">LC</button>
      <section class="line-copilot-panel">
        <header class="line-copilot-header">
          <div class="line-copilot-heading-group">
            <span class="line-copilot-brand-mark" aria-hidden="true">LC</span>
            <div class="line-copilot-heading-copy">
              <h1 class="line-copilot-title">LINE COPILOT</h1>
              <span class="line-copilot-subtitle">聊天室偵測器</span>
            </div>
          </div>
          <button id="line-copilot-collapse-button" class="line-copilot-icon-button" type="button" aria-label="收合 LINE COPILOT 面板" title="收合面板">›</button>
        </header>
        <main class="line-copilot-content">
          <div id="line-copilot-status-card" class="line-copilot-status-card">
            <span class="line-copilot-status-dot" aria-hidden="true"></span>
            <span id="line-copilot-status-text" class="line-copilot-status-text">偵測中</span>
          </div>

          <section class="line-copilot-detector-section" aria-labelledby="line-copilot-chat-heading">
            <h2 id="line-copilot-chat-heading" class="line-copilot-section-title">目前聊天室</h2>
            <dl class="line-copilot-detail-list">
              <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">已開啟</dt><dd id="line-copilot-chat-open" class="line-copilot-detail-value">偵測中</dd></div>
              <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">聊天對象</dt><dd id="line-copilot-contact-name" class="line-copilot-detail-value">偵測中</dd></div>
              <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">聊天室 ID</dt><dd id="line-copilot-conversation-id" class="line-copilot-detail-value line-copilot-detail-mono">偵測中</dd></div>
              <div class="line-copilot-detail-row line-copilot-detail-row-stacked"><dt class="line-copilot-detail-label">目前網址</dt><dd id="line-copilot-current-url" class="line-copilot-detail-value line-copilot-detail-mono">偵測中</dd></div>
              <div class="line-copilot-detail-row line-copilot-detail-row-stacked"><dt class="line-copilot-detail-label">最後偵測時間</dt><dd id="line-copilot-detected-at" class="line-copilot-detail-value">偵測中</dd></div>
            </dl>
          </section>

          <section class="line-copilot-detector-section" aria-labelledby="line-copilot-messages-heading">
            <div class="line-copilot-section-heading-row">
              <h2 id="line-copilot-messages-heading" class="line-copilot-section-title">最近可見訊息</h2>
              <span class="line-copilot-section-note">最多 5 則</span>
            </div>
            <ol id="line-copilot-message-list" class="line-copilot-message-list" aria-live="polite">
              <li class="line-copilot-message-empty">偵測中</li>
            </ol>
          </section>

          <button id="line-copilot-debug-toggle" class="line-copilot-secondary-button" type="button" aria-expanded="false" aria-controls="line-copilot-debug-panel">顯示偵錯資訊</button>
          <section id="line-copilot-debug-panel" class="line-copilot-debug-panel" hidden>
            <h2 class="line-copilot-section-title">偵錯資訊</h2>
            <dl class="line-copilot-detail-list">
              <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">候選名稱元素</dt><dd id="line-copilot-debug-name-count" class="line-copilot-detail-value">0</dd></div>
              <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">候選訊息元素</dt><dd id="line-copilot-debug-message-count" class="line-copilot-detail-value">0</dd></div>
              <div class="line-copilot-detail-row line-copilot-detail-row-stacked"><dt class="line-copilot-detail-label">偵測策略</dt><dd id="line-copilot-debug-strategy" class="line-copilot-detail-value line-copilot-detail-mono">尚未偵測到</dd></div>
              <div class="line-copilot-detail-row line-copilot-detail-row-stacked"><dt class="line-copilot-detail-label">最近 DOM 更新</dt><dd id="line-copilot-debug-dom-time" class="line-copilot-detail-value">尚未偵測到</dd></div>
            </dl>
          </section>

          <button id="line-copilot-test-button" class="line-copilot-primary-button" type="button">測試功能</button>
          <p id="line-copilot-test-result" class="line-copilot-test-result" role="status" aria-live="polite"></p>
        </main>
        <footer class="line-copilot-footer">
          <p class="line-copilot-privacy">目前僅在瀏覽器本機偵測畫面內容，資料不會傳送到外部伺服器。</p>
          <button id="line-copilot-close-button" class="line-copilot-secondary-button" type="button">關閉面板</button>
          <span class="line-copilot-version">v1.1.0</span>
        </footer>
      </section>
    `;

    root.querySelector("#line-copilot-collapse-button").addEventListener("click", () => {
      lineCopilotSetCollapsed(root, true);
    });
    root.querySelector("#line-copilot-close-button").addEventListener("click", () => {
      lineCopilotSetCollapsed(root, true);
    });
    root.querySelector("#line-copilot-expand-button").addEventListener("click", () => {
      lineCopilotSetCollapsed(root, false);
    });
    root.querySelector("#line-copilot-test-button").addEventListener("click", () => {
      lineCopilotSetText("line-copilot-test-result", "LINE COPILOT 測試成功");
    });
    root.querySelector("#line-copilot-debug-toggle").addEventListener("click", (event) => {
      const debugPanel = root.querySelector("#line-copilot-debug-panel");
      const expanded = event.currentTarget.getAttribute("aria-expanded") === "true";
      event.currentTarget.setAttribute("aria-expanded", String(!expanded));
      event.currentTarget.textContent = expanded ? "顯示偵錯資訊" : "隱藏偵錯資訊";
      debugPanel.hidden = expanded;
    });

    return root;
  }

  function lineCopilotEnsurePanel() {
    if (!document.body) return null;

    let root = document.getElementById(LINE_COPILOT_ROOT_ID);
    if (!root) {
      root = lineCopilotCreatePanel();
      document.body.appendChild(root);
    }
    return root;
  }

  function lineCopilotRunDetection(reason) {
    lineCopilotRuntime.pendingReason = reason;
    if (!lineCopilotEnsurePanel()) return;
    const state = detectChatState();
    updateCopilotPanel(state);
  }

  function lineCopilotScheduleDetection(reason) {
    lineCopilotRuntime.pendingReason = reason;
    window.clearTimeout(lineCopilotRuntime.debounceId);
    lineCopilotRuntime.debounceId = window.setTimeout(() => {
      lineCopilotRunDetection(lineCopilotRuntime.pendingReason);
    }, LINE_COPILOT_DEBOUNCE_MS);
  }

  function lineCopilotPatchHistory() {
    ["pushState", "replaceState"].forEach((methodName) => {
      const originalMethod = window.history[methodName];
      if (originalMethod.__lineCopilotPatched) return;

      const patchedMethod = function (...args) {
        const result = originalMethod.apply(this, args);
        window.dispatchEvent(
          new CustomEvent(LINE_COPILOT_NAVIGATION_EVENT, {
            detail: { method: methodName }
          })
        );
        return result;
      };
      Object.defineProperty(patchedMethod, "__lineCopilotPatched", {
        value: true
      });
      window.history[methodName] = patchedMethod;
    });
  }

  function observeLinePageChanges() {
    lineCopilotPatchHistory();

    const observer = new MutationObserver((mutations) => {
      const root = document.getElementById(LINE_COPILOT_ROOT_ID);
      const hasExternalMutation = mutations.some((mutation) => {
        if (root && root.contains(mutation.target)) return false;
        return true;
      });

      if (!root) {
        lineCopilotEnsurePanel();
      }
      if (hasExternalMutation) {
        lineCopilotRuntime.lastDomUpdateAt = lineCopilotFormatTimestamp();
        lineCopilotScheduleDetection("dom-mutation");
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "aria-selected", "title"]
    });

    const handleNavigation = () => {
      lineCopilotRuntime.lastUrl = window.location.href;
      lineCopilotScheduleDetection("navigation");
    };
    window.addEventListener(LINE_COPILOT_NAVIGATION_EVENT, handleNavigation);
    window.addEventListener("popstate", handleNavigation);
    window.addEventListener("hashchange", handleNavigation);

    if (window.navigation?.addEventListener) {
      window.navigation.addEventListener("navigate", handleNavigation);
    }

    const intervalId = window.setInterval(() => {
      lineCopilotEnsurePanel();
      if (lineCopilotRuntime.lastUrl !== window.location.href) {
        lineCopilotRuntime.lastUrl = window.location.href;
        lineCopilotScheduleDetection("url-poll");
      }
    }, 1000);

    return { observer, intervalId };
  }

  lineCopilotEnsurePanel();
  lineCopilotRunDetection("initial-load");

  if (!window[LINE_COPILOT_MONITOR_KEY]) {
    window[LINE_COPILOT_MONITOR_KEY] = observeLinePageChanges();
  }
})();
