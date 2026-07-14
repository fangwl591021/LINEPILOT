(() => {
  "use strict";

  const LINE_COPILOT_ROOT_ID = "line-copilot-root";
  const LINE_COPILOT_COLLAPSED_CLASS = "line-copilot-collapsed";
  const LINE_COPILOT_MONITOR_KEY = "__lineCopilotMonitor";
  const LINE_COPILOT_NAVIGATION_EVENT = "line-copilot-navigation";
  const LINE_COPILOT_DEBOUNCE_MS = 500;
  const LINE_COPILOT_CONTACT_RETRY_DELAYS = [0, 300, 800, 1500, 3000];
  const LINE_COPILOT_EMPTY_VALUE = "尚未偵測到";
  const LINE_COPILOT_MESSAGE_LIMIT = 5;
  const LINE_COPILOT_TIME_PATTERN = /(?:上午|下午)?\s*(?:[01]?\d|2[0-3]):[0-5]\d/;
  const LINE_COPILOT_DATE_PATTERN = /^(今天|昨天|前天|星期[一二三四五六日天]|週[一二三四五六日天]|\d{4}[\/.年-]\d{1,2}(?:[\/.月-]\d{1,2}日?)?|\d{1,2}[\/.月-]\d{1,2}日?)$/;
  const LINE_COPILOT_HEADER_SELECTOR = [
    "[data-testid*='chat-header' i]",
    "[data-testid*='conversation-header' i]",
    "[class*='chat-header' i]",
    "[class*='conversation-header' i]",
    "[class*='room-header' i]",
    "header"
  ].join(",");
  const LINE_COPILOT_STREAM_SELECTOR = [
    "[data-testid*='message-list' i]",
    "[data-testid*='message-stream' i]",
    "[role='log']",
    "[class*='message-list' i]",
    "[class*='message-stream' i]",
    "[class*='chat-history' i]",
    "[class*='conversation-body' i]"
  ].join(",");
  const LINE_COPILOT_MESSAGE_SELECTOR = [
    "[data-message-id]",
    "[data-testid*='message' i]",
    "[data-direction]",
    "[data-sender-type]",
    "[data-message-type]",
    "[class*='message-item' i]",
    "[class*='message-row' i]",
    "[class*='chat-message' i]",
    "[class*='message-bubble' i]",
    "[class~='bubble' i]",
    "[class*='system-message' i]"
  ].join(",");
  const LINE_COPILOT_DEDICATED_TEXT_SELECTOR = [
    "[data-testid*='message-text' i]",
    "[data-testid*='bubble-text' i]",
    "[class*='message-text' i]",
    "[class*='bubble-text' i]",
    "[class*='text-content' i]"
  ].join(",");

  const lineCopilotRuntime = {
    debounceId: null,
    lastUrl: window.location.href,
    lastDomUpdateAt: LINE_COPILOT_EMPTY_VALUE,
    pendingReason: "initial-load",
    latestState: null,
    cachedStreamElement: null,
    contactRetryTimers: [],
    lastSuccessfulContact: null
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
    while (ancestor && ancestor !== document.body && checkedAncestors < 10) {
      const ancestorStyle = window.getComputedStyle(ancestor);
      if (
        /(auto|scroll|hidden|clip)/.test(
          `${ancestorStyle.overflow} ${ancestorStyle.overflowX} ${ancestorStyle.overflowY}`
        )
      ) {
        const ancestorRect = ancestor.getBoundingClientRect();
        if (
          rect.right <= ancestorRect.left ||
          rect.left >= ancestorRect.right ||
          rect.bottom <= ancestorRect.top ||
          rect.top >= ancestorRect.bottom
        ) {
          return false;
        }
      }
      ancestor = ancestor.parentElement;
      checkedAncestors += 1;
    }
    return true;
  }

  function lineCopilotGetSignal(element, stopElement = null) {
    const parts = [];
    let current = element;
    let depth = 0;
    while (current && current !== document.body && current !== stopElement && depth < 7) {
      parts.push(
        current.id,
        typeof current.className === "string" ? current.className : "",
        current.getAttribute("data-testid"),
        current.getAttribute("data-direction"),
        current.getAttribute("data-sender-type"),
        current.getAttribute("data-message-type"),
        current.getAttribute("role"),
        current.getAttribute("aria-label")
      );
      current = current.parentElement;
      depth += 1;
    }
    return parts.filter(Boolean).join(" ").toLowerCase();
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

        for (const key of ["conversationId", "chatId", "roomId", "userId"]) {
          const value = currentUrl.searchParams.get(key);
          if (value && /^[A-Za-z0-9_-]{8,}$/.test(value)) {
            return { value, strategy: `url:query-${key}` };
          }
        }

        const pathParts = currentUrl.pathname
          .split("/")
          .map((part) => decodeURIComponent(part).trim())
          .filter(Boolean);
        const chatIndex = pathParts.findIndex((part) => part.toLowerCase() === "chat");
        const chatCandidate = chatIndex >= 0 ? pathParts[chatIndex + 1] : null;
        if (chatCandidate && /^[A-Za-z0-9_-]{12,}$/.test(chatCandidate)) {
          return { value: chatCandidate, strategy: "url:chat-path-segment" };
        }

        const ignored = new Set(["chat", "account", "settings", "login", "home", "list"]);
        const candidate = pathParts
          .slice()
          .reverse()
          .find(
            (part) =>
              /^[A-Za-z0-9_-]{12,}$/.test(part) && !ignored.has(part.toLowerCase())
          );
        return candidate
          ? { value: candidate, strategy: "url:path-segment" }
          : { value: null, strategy: "url:no-identifier" };
      },
      { value: null, strategy: "url:error" }
    );
  }

  function lineCopilotFindMessageStream() {
    return lineCopilotSafeRun(
      "message stream detection",
      () => {
        const usableRight = lineCopilotGetUsableRightEdge();
        const cachedStream = lineCopilotRuntime.cachedStreamElement;
        if (
          cachedStream &&
          document.contains(cachedStream) &&
          lineCopilotIsElementVisible(cachedStream)
        ) {
          return {
            element: cachedStream,
            rect: cachedStream.getBoundingClientRect(),
            strategy: "stream:cached-visible-container",
            candidateCount: 1
          };
        }
        const candidates = new Map();

        const addCandidate = (element, strategy, baseScore) => {
          if (!lineCopilotIsElementVisible(element) || element.closest("nav,aside,form")) {
            return;
          }
          const rect = element.getBoundingClientRect();
          if (
            rect.left < Math.max(220, usableRight * 0.2) ||
            rect.right > usableRight + 2 ||
            rect.top < 70 ||
            rect.width < 260 ||
            rect.height < 140
          ) {
            return;
          }

          const style = window.getComputedStyle(element);
          const descendantCount = Math.min(
            element.querySelectorAll(LINE_COPILOT_MESSAGE_SELECTOR).length,
            8
          );
          let score = baseScore + descendantCount * 5;
          if (/(auto|scroll)/.test(`${style.overflowY} ${style.overflow}`)) score += 16;
          if (/(message|chat|conversation|history|stream|talk)/.test(lineCopilotGetSignal(element))) {
            score += 16;
          }
          const existing = candidates.get(element);
          if (!existing || score > existing.score) {
            candidates.set(element, { element, rect, score, strategy });
          }
        };

        document
          .querySelectorAll(LINE_COPILOT_STREAM_SELECTOR)
          .forEach((element) => addCandidate(element, "stream:semantic-container", 55));

        const messageNodes = Array.from(
          document.querySelectorAll(LINE_COPILOT_MESSAGE_SELECTOR)
        ).slice(0, 500);
        messageNodes.forEach((messageNode) => {
          let ancestor = messageNode.parentElement;
          let depth = 0;
          while (ancestor && ancestor !== document.body && depth < 5) {
            if (ancestor.querySelectorAll(LINE_COPILOT_MESSAGE_SELECTOR).length >= 2) {
              addCandidate(ancestor, "stream:common-message-ancestor", 25 - depth * 2);
            }
            ancestor = ancestor.parentElement;
            depth += 1;
          }
        });

        const currentBest = Math.max(0, ...Array.from(candidates.values()).map((item) => item.score));
        if (currentBest < 70) {
          Array.from(document.querySelectorAll("main,section,[role='main'],div"))
            .slice(0, 2500)
            .forEach((element) => {
              if (
                !lineCopilotIsElementVisible(element) ||
                element.closest("nav,aside,form,header,footer")
              ) {
                return;
              }
              const rect = element.getBoundingClientRect();
              if (
                rect.left < Math.max(220, usableRight * 0.24) ||
                rect.right > usableRight + 2 ||
                rect.top < 90 ||
                rect.top > 420 ||
                rect.width < 300 ||
                rect.height < 180
              ) {
                return;
              }
              const text = lineCopilotNormalizeText(element.innerText || element.textContent);
              const timePattern = new RegExp(LINE_COPILOT_TIME_PATTERN.source, "g");
              const timeCount = Math.min((text.match(timePattern) || []).length, 5);
              const lineCount = Math.min(text.split("\n").filter(Boolean).length, 12);
              const style = window.getComputedStyle(element);
              const overflowSignal = /(auto|scroll|hidden|clip)/.test(
                `${style.overflow} ${style.overflowX} ${style.overflowY}`
              );
              if (!overflowSignal && timeCount === 0) return;
              const baseScore = 28 + timeCount * 5 + Math.min(lineCount, 5) + (overflowSignal ? 12 : 0);
              addCandidate(element, "stream:visible-conversation-region", baseScore);
            });
        }

        const sorted = Array.from(candidates.values()).sort(
          (left, right) => right.score - left.score
        );
        const selected = sorted[0];
        lineCopilotRuntime.cachedStreamElement = selected?.score >= 45 ? selected.element : null;
        return {
          element: selected?.score >= 45 ? selected.element : null,
          rect: selected?.score >= 45 ? selected.rect : null,
          strategy: selected?.score >= 45 ? selected.strategy : "stream:not-found",
          candidateCount: sorted.length
        };
      },
      { element: null, rect: null, strategy: "stream:error", candidateCount: 0 }
    );
  }

  function lineCopilotDirectText(element) {
    const rawDirectText = Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(" ");
    const attributeText = element.getAttribute("aria-label") || element.getAttribute("title");
    const rawText = rawDirectText.trim()
      ? rawDirectText
      : element.children.length === 0
        ? element.textContent
        : attributeText;
    return { raw: String(rawText || ""), normalized: lineCopilotNormalizeText(rawText) };
  }

  function lineCopilotIsPlausibleContactName(rawText, text) {
    if (!text || text.length > 60 || rawText.includes("\n") || /https?:\/\//i.test(text)) {
      return false;
    }
    if (/^\d+$/.test(text) || LINE_COPILOT_DATE_PATTERN.test(text) || LINE_COPILOT_TIME_PATTERN.test(text)) {
      return false;
    }
    const excluded = /^(今天|昨天|日期|時間|待處理|處理完畢|搜尋|搜索|使用手動聊天|自動回應訊息(?:功能執行中)?|LINE|LINE COPILOT)$/i;
    return !excluded.test(text);
  }

  function lineCopilotFindChatHeader(streamResult) {
    const usableRight = lineCopilotGetUsableRightEdge();
    const streamRect = streamResult.rect;
    const candidates = [];
    document.querySelectorAll(LINE_COPILOT_HEADER_SELECTOR).forEach((element) => {
      if (!lineCopilotIsElementVisible(element) || element.closest("nav,aside")) return;
      const rect = element.getBoundingClientRect();
      if (
        rect.top < 45 ||
        rect.top > 260 ||
        rect.left < Math.max(220, usableRight * 0.2) ||
        rect.right > usableRight + 2 ||
        rect.width < 150
      ) {
        return;
      }
      let score = 38;
      let strategy = "header:top-region";
      if (streamRect) {
        const overlap = Math.max(
          0,
          Math.min(rect.right, streamRect.right) - Math.max(rect.left, streamRect.left)
        );
        const overlapRatio = overlap / Math.max(1, Math.min(rect.width, streamRect.width));
        if (overlapRatio < 0.45 || rect.bottom > streamRect.top + 120) return;
        score += overlapRatio * 30;
        if (rect.bottom <= streamRect.top + 30) score += 22;
        strategy = "header:stream-aligned";
      }
      if (/(chat|conversation|room).*(header|head)|header.*(chat|conversation|room)/.test(lineCopilotGetSignal(element))) {
        score += 24;
      }
      candidates.push({ element, score, strategy });
    });
    candidates.sort((left, right) => right.score - left.score);
    return candidates[0] || { element: null, strategy: "header:not-found", score: 0 };
  }

  function lineCopilotGetHeaderRegion(streamResult) {
    const usableRight = lineCopilotGetUsableRightEdge();
    const streamRect = streamResult?.rect || null;
    return {
      top: 0,
      bottom: streamRect
        ? Math.min(280, Math.max(120, streamRect.top + 20))
        : Math.min(280, window.innerHeight * 0.34),
      left: streamRect ? Math.max(0, streamRect.left - 160) : 0,
      right: streamRect ? Math.min(usableRight, streamRect.right + 24) : usableRight,
      streamTop: streamRect?.top ?? null,
      streamLeft: streamRect?.left ?? null
    };
  }

  function lineCopilotGetVisibleAvatars(region) {
    return Array.from(
      document.querySelectorAll(
        "img,[data-testid*='avatar' i],[class*='avatar' i],[class*='profile-image' i],[class*='user-image' i]"
      )
    )
      .slice(0, 600)
      .filter((element) => {
        if (!lineCopilotIsElementVisible(element)) return false;
        const rect = element.getBoundingClientRect();
        return (
          rect.width >= 18 &&
          rect.width <= 110 &&
          rect.height >= 18 &&
          rect.height <= 110 &&
          rect.bottom >= region.top - 20 &&
          rect.top <= region.bottom + 80 &&
          (rect.right >= region.left - 40 || rect.top <= 110) &&
          rect.left <= region.right + 40
        );
      });
  }

  function lineCopilotNearestAvatarDistance(rect, avatars) {
    let nearest = Number.POSITIVE_INFINITY;
    avatars.forEach((avatar) => {
      const avatarRect = avatar.getBoundingClientRect();
      const horizontal = rect.left - avatarRect.right;
      const vertical = Math.abs(
        rect.top + rect.height / 2 - (avatarRect.top + avatarRect.height / 2)
      );
      if (horizontal < -30 || horizontal > 220 || vertical > 90) return;
      nearest = Math.min(nearest, Math.hypot(Math.max(0, horizontal), vertical));
    });
    return Number.isFinite(nearest) ? Math.round(nearest) : null;
  }

  function lineCopilotIsExcludedNameText(text) {
    if (!text) return true;
    if (LINE_COPILOT_DATE_PATTERN.test(text) || LINE_COPILOT_TIME_PATTERN.test(text)) return true;
    if (/^\d+$/.test(text) || /https?:\/\//i.test(text)) return true;
    return /^(今天|昨天|日期|時間|待處理|處理完畢|搜尋|搜索|自動回應訊息(?:功能執行中)?|使用手動聊天|預約傳送|已讀|未讀|傳送|LINE|LINE COPILOT)$/i.test(
      text
    );
  }

  function lineCopilotMergeVisibleNameText(element) {
    if (
      !(element instanceof Element) ||
      element.closest("button,a,menu,[role='button'],[role='menu'],[role='toolbar']")
    ) {
      return { text: "", childTextCount: 0 };
    }

    const directParts = Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => lineCopilotNormalizeText(node.textContent))
      .filter(Boolean);
    const childParts = Array.from(element.children)
      .filter(
        (child) =>
          lineCopilotIsElementVisible(child) &&
          !child.matches(
            "button,a,time,menu,[role='button'],[role='menu'],[role='toolbar'],[aria-hidden='true'],[class*='time' i],[class*='status' i],[class*='badge' i],[class*='unread' i]"
          )
      )
      .map((child) => lineCopilotNormalizeText(child.innerText || child.textContent))
      .filter(
        (text) =>
          text &&
          !text.includes("\n") &&
          text.length <= 40 &&
          !lineCopilotIsExcludedNameText(text)
      );

    const parts = [...directParts, ...childParts];
    if (parts.length) {
      return {
        text: lineCopilotNormalizeText(parts.join("")),
        childTextCount: childParts.length
      };
    }
    const fallback = lineCopilotNormalizeText(
      element.innerText || element.textContent || element.getAttribute("aria-label") || element.title
    );
    return { text: fallback, childTextCount: 0 };
  }

  function lineCopilotCollectHeaderDiagnostics(streamResult) {
    const region = lineCopilotGetHeaderRegion(streamResult);
    const avatars = lineCopilotGetVisibleAvatars(region);
    const records = [];
    Array.from(document.querySelectorAll("body *"))
      .slice(0, 4000)
      .forEach((element) => {
        if (!lineCopilotIsElementVisible(element)) return;
        const rect = element.getBoundingClientRect();
        const parent = element.parentElement;
        const parentRect = parent?.getBoundingClientRect();
        const isHeaderOverflow = Boolean(
          rect.left < region.left &&
          rect.top <= 110 &&
          region.streamLeft !== null &&
          parentRect &&
          parentRect.right >= region.streamLeft + 40
        );
        if (
          rect.bottom < region.top ||
          rect.top > region.bottom ||
          (rect.left < region.left && !isHeaderOverflow) ||
          rect.left > region.right ||
          rect.height > 150
        ) {
          return;
        }
        const rawText = lineCopilotNormalizeText(element.innerText || element.textContent);
        const ariaLabel = lineCopilotNormalizeText(element.getAttribute("aria-label"));
        const title = lineCopilotNormalizeText(element.getAttribute("title"));
        if (!rawText && !ariaLabel && !title) return;
        const diagnostic = {
          tagName: element.tagName.toLowerCase(),
          innerText: rawText.slice(0, 240),
          ariaLabel: ariaLabel.slice(0, 160),
          title: title.slice(0, 160),
          role: element.getAttribute("role") || null,
          className:
            typeof element.className === "string" ? element.className.slice(0, 240) : "",
          boundingClientRect: {
            top: Math.round(rect.top),
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
            left: Math.round(rect.left),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          parentTagName: parent?.tagName?.toLowerCase() || null,
          parentClassName:
            parent && typeof parent.className === "string"
              ? parent.className.slice(0, 240)
              : "",
          visible: true,
          topDistance: Math.round(rect.top - region.top),
          avatarDistance: lineCopilotNearestAvatarDistance(rect, avatars)
        };
        records.push({ element, rect, diagnostic });
      });

    records.sort((left, right) => {
      const vertical = left.rect.top - right.rect.top;
      if (Math.abs(vertical) > 2) return vertical;
      const areaLeft = left.rect.width * left.rect.height;
      const areaRight = right.rect.width * right.rect.height;
      return areaLeft - areaRight || left.rect.left - right.rect.left;
    });
    return { region, avatars, records: records.slice(0, 30) };
  }

  function lineCopilotExtractSelectedListName(item, avatars) {
    const itemRect = item.getBoundingClientRect();
    const candidates = [];
    Array.from(item.querySelectorAll("span,p,strong,b,div"))
      .slice(0, 120)
      .filter((element) => element.children.length <= 1 && lineCopilotIsElementVisible(element))
      .forEach((element) => {
        if (element.closest("button,a,time,[role='button'],[class*='time' i],[class*='badge' i],[class*='unread' i]")) return;
        const { text } = lineCopilotMergeVisibleNameText(element);
        if (
          !text ||
          text.length < 1 ||
          text.length > 40 ||
          text.includes("\n") ||
          lineCopilotIsExcludedNameText(text)
        ) {
          return;
        }
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const fontSize = Number.parseFloat(style.fontSize || "0");
        const fontWeight = Number.parseInt(style.fontWeight || "400", 10) || 400;
        let score = fontSize * 2 + (fontWeight >= 600 ? 18 : 0);
        if (rect.top <= itemRect.top + itemRect.height * 0.58) score += 18;
        if (/(name|title|contact|user)/.test(lineCopilotGetSignal(element, item))) score += 18;
        const avatarDistance = lineCopilotNearestAvatarDistance(rect, avatars);
        if (avatarDistance !== null && avatarDistance <= 150) score += 16;
        candidates.push({ text, score, rect });
      });
    candidates.sort((left, right) => right.score - left.score || left.rect.top - right.rect.top);
    return candidates[0] || null;
  }

  function lineCopilotDetectSelectedChatListName(streamResult) {
    const streamRect = streamResult?.rect || null;
    const usableRight = lineCopilotGetUsableRightEdge();
    const chatLeft = streamRect?.left ?? usableRight * 0.48;
    if (chatLeft < 180) return null;
    const region = { top: 60, bottom: window.innerHeight, left: 0, right: chatLeft + 80 };
    const avatars = lineCopilotGetVisibleAvatars(region);
    const items = [];
    Array.from(
      document.querySelectorAll(
        "[aria-selected='true'],[aria-current],li,[role='listitem'],[class*='selected' i],[class*='active' i],div"
      )
    )
      .slice(0, 3000)
      .forEach((element) => {
        if (!lineCopilotIsElementVisible(element) || element.closest("nav[aria-label*='main' i],header,footer,form")) return;
        const rect = element.getBoundingClientRect();
        if (
          rect.left < 0 ||
          rect.right > chatLeft + 80 ||
          rect.top < 60 ||
          rect.width < 120 ||
          rect.height < 36 ||
          rect.height > 180
        ) {
          return;
        }
        const signal = lineCopilotGetSignal(element);
        const style = window.getComputedStyle(element);
        const parentStyle = element.parentElement
          ? window.getComputedStyle(element.parentElement)
          : null;
        let itemScore = 0;
        if (element.getAttribute("aria-selected") === "true") itemScore += 70;
        if (element.hasAttribute("aria-current")) itemScore += 65;
        if (/(selected|active|current|focused|highlight)/.test(signal)) itemScore += 40;
        if (
          parentStyle &&
          style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
          style.backgroundColor !== "transparent" &&
          style.backgroundColor !== parentStyle.backgroundColor
        ) {
          itemScore += 24;
        }
        if (itemScore < 24) return;
        const name = lineCopilotExtractSelectedListName(element, avatars);
        if (!name) return;
        items.push({ element, name, itemScore, totalScore: itemScore + name.score });
      });
    items.sort((left, right) => right.totalScore - left.totalScore);
    const selected = items[0];
    if (!selected || selected.totalScore < 70) return null;
    return {
      value: selected.name.text,
      source: "selected-chat-list-item",
      confidence: selected.totalScore >= 120 ? "medium" : "low",
      score: Math.round(selected.totalScore),
      evidence: ["左側聊天室項目具有選取／高亮證據", "主要名稱文字分數最高"]
    };
  }

  function detectContactName(streamResult) {
    return lineCopilotSafeRun(
      "contact name detection",
      () => {
        const headerScan = lineCopilotCollectHeaderDiagnostics(streamResult);
        const byText = new Map();
        headerScan.records.forEach(({ element, rect, diagnostic }) => {
          if (element.closest("button,a,menu,[role='button'],[role='menu'],[role='toolbar']")) return;
          const { text, childTextCount } = lineCopilotMergeVisibleNameText(element);
          if (
            !text ||
            text.length < 1 ||
            text.length > 40 ||
            text.includes("\n") ||
            lineCopilotIsExcludedNameText(text)
          ) {
            return;
          }
          const style = window.getComputedStyle(element);
          const fontSize = Number.parseFloat(style.fontSize || "0");
          const signal = lineCopilotGetSignal(element);
          const evidence = ["位於中央聊天室頂部診斷區域"];
          let score = 32;
          if (headerScan.region.streamTop !== null && rect.bottom <= headerScan.region.streamTop + 20) {
            score += 24;
            evidence.push("位於訊息列表上方");
          }
          if (diagnostic.avatarDistance !== null && diagnostic.avatarDistance <= 180) {
            score += 32;
            evidence.push(`鄰近圓形頭像 ${diagnostic.avatarDistance}px`);
            if (diagnostic.avatarDistance <= 90) score += 12;
          }
          if (fontSize >= 18) {
            score += 18;
            evidence.push(`字型 ${fontSize}px`);
          } else if (fontSize >= 14) {
            score += 9;
            evidence.push(`字型 ${fontSize}px`);
          }
          if (element.matches("h1,h2,h3,[role='heading']")) {
            score += 18;
            evidence.push("具 heading 語意");
          }
          if (/(name|title|contact|profile|user|friend|member)/.test(signal)) {
            score += 16;
            evidence.push("具名稱語意");
          }
          if (childTextCount >= 2) {
            score += 10;
            evidence.push("合併多個可見子元素文字");
          }
          const source = childTextCount >= 2 ? "header-parent" : "header";
          const candidate = {
            text,
            score: Math.round(score),
            evidence,
            source
          };
          const existing = byText.get(text);
          if (!existing || candidate.score > existing.score) byText.set(text, candidate);
        });

        const candidates = Array.from(byText.values()).sort(
          (left, right) => right.score - left.score
        );
        const headerSelected = candidates[0]?.score >= 70 ? candidates[0] : null;
        if (headerSelected) {
          return {
            value: headerSelected.text,
            source: headerSelected.source,
            confidence:
              headerSelected.score >= 105
                ? "high"
                : headerSelected.score >= 82
                  ? "medium"
                  : "low",
            strategy: headerSelected.source,
            candidateCount: candidates.length,
            candidates: candidates.slice(0, 20),
            headerCandidates: headerScan.records.map((record) => record.diagnostic),
            selectionReason: `選擇 ${headerSelected.source} 最高分 ${headerSelected.score}：${headerSelected.evidence.join("；")}`
          };
        }

        const listFallback = lineCopilotDetectSelectedChatListName(streamResult);
        if (listFallback) {
          candidates.push({
            text: listFallback.value,
            score: listFallback.score,
            evidence: listFallback.evidence,
            source: listFallback.source
          });
          return {
            value: listFallback.value,
            source: listFallback.source,
            confidence: listFallback.confidence,
            strategy: listFallback.source,
            candidateCount: candidates.length,
            candidates: candidates.slice(0, 20),
            headerCandidates: headerScan.records.map((record) => record.diagnostic),
            selectionReason: `Header 未達門檻，使用左側選中聊天室項目（${listFallback.score} 分）`
          };
        }

        return {
          value: null,
          source: "unknown",
          confidence: "low",
          strategy: "unknown",
          candidateCount: candidates.length,
          candidates: candidates.slice(0, 20),
          headerCandidates: headerScan.records.map((record) => record.diagnostic),
          selectionReason: "Header 與左側選中聊天室項目皆無可靠名稱，寧可不猜測"
        };
      },
      {
        value: null,
        source: "unknown",
        confidence: "low",
        strategy: "unknown",
        candidateCount: 0,
        candidates: [],
        headerCandidates: [],
        selectionReason: "名稱偵測發生錯誤"
      }
    );
  }

  function lineCopilotExtractMessageTime(element, rawText, stream) {
    const direct = rawText.match(LINE_COPILOT_TIME_PATTERN);
    if (direct) return direct[0].replace(/\s+/g, " ").trim();

    const nearby = [
      element.querySelector("time,[class*='time' i],[data-testid*='time' i]"),
      element.previousElementSibling,
      element.nextElementSibling,
      element.parentElement?.querySelector("time,[class*='time' i]")
    ].filter((candidate) => candidate && stream.contains(candidate));
    for (const candidate of nearby) {
      if (!lineCopilotIsElementVisible(candidate)) continue;
      const match = lineCopilotNormalizeText(candidate.textContent).match(
        LINE_COPILOT_TIME_PATTERN
      );
      if (match) return match[0].replace(/\s+/g, " ").trim();
    }
    return null;
  }

  function lineCopilotCleanMessageText(rawText) {
    return lineCopilotNormalizeText(
      String(rawText || "")
        .split(/\n+/)
        .map((line) => lineCopilotNormalizeText(line))
        .map((line) => line.replace(LINE_COPILOT_TIME_PATTERN, "").trim())
        .filter(Boolean)
        .filter((line) => !/^(已讀|未讀|傳送|重試|刪除|回覆)$/i.test(line))
        .join(" ")
    );
  }

  function lineCopilotExtractMessagePayload(candidate) {
    const dedicatedNodes = Array.from(
      candidate.querySelectorAll(LINE_COPILOT_DEDICATED_TEXT_SELECTOR)
    ).filter(
      (element) =>
        lineCopilotIsElementVisible(element) &&
        !element.closest("button,a,menu,[role='button'],[role='menu'],[role='toolbar']")
    );
    const dedicated = dedicatedNodes.find((element) => {
      const text = lineCopilotCleanMessageText(element.innerText || element.textContent);
      return Boolean(text);
    });
    const sourceElement = dedicated || candidate;
    const rawText = lineCopilotNormalizeText(
      sourceElement.innerText || sourceElement.textContent
    );
    return {
      sourceElement,
      rawText,
      text: lineCopilotCleanMessageText(rawText),
      strategy: dedicated ? "text:dedicated-message-node" : "text:message-root"
    };
  }

  function lineCopilotClassifyExclusion(candidate, payload, stream) {
    const { sourceElement, text } = payload;
    if (!text) return "empty-text";
    if (text.length > 600 || text.split("\n").length > 5) return "text-too-large";
    if (LINE_COPILOT_DATE_PATTERN.test(text) || LINE_COPILOT_TIME_PATTERN.test(text)) {
      return "date-or-time-divider";
    }
    if (/^(已讀|未讀|傳送|預約傳送|使用手動聊天|待處理|處理完畢|搜尋|搜索)$/i.test(text)) {
      return "known-ui-or-status-text";
    }
    if (/自動回應訊息|使用手動聊天|目前為回應時間內|預約傳送/.test(text)) {
      return "system-control-prompt";
    }
    if (/^(加\s*LINE\s*好友|手機聯絡|立即購買|查看更多|開啟連結)$/i.test(text)) {
      return "known-card-action-text";
    }

    const signal = lineCopilotGetSignal(candidate, stream);
    const interactiveAncestor = sourceElement.closest(
      "button,a,menu,[role='button'],[role='menu'],[role='toolbar'],[class*='toolbar' i],[class*='action-area' i]"
    );
    if (interactiveAncestor && stream.contains(interactiveAncestor)) {
      return "interactive-control-text";
    }
    if (
      /(rich.?menu|imagemap|image.?map|carousel|card|template|quick.?reply|coupon|product.?card|button.?area|action.?area|toolbar)/.test(
        signal
      )
    ) {
      return "rich-menu-or-card-container";
    }

    const controls = candidate.querySelectorAll(
      "button,a,menu,[role='button'],[role='menu'],[role='toolbar']"
    );
    if (controls.length > 0 && payload.strategy !== "text:dedicated-message-node") {
      return "message-root-contains-controls";
    }

    const media = candidate.querySelector("img,picture,video,canvas,svg,[class*='image' i]");
    if (media && payload.strategy !== "text:dedicated-message-node") {
      return "media-without-independent-text";
    }
    return null;
  }

  function lineCopilotFindNearbyAvatar(candidate, messageRect, stream) {
    const searchRoot = candidate.parentElement && stream.contains(candidate.parentElement)
      ? candidate.parentElement
      : candidate;
    const avatars = searchRoot.querySelectorAll(
      "img,[data-testid*='avatar' i],[class*='avatar' i],[class*='profile-image' i]"
    );
    for (const avatar of avatars) {
      if (!lineCopilotIsElementVisible(avatar)) continue;
      const rect = avatar.getBoundingClientRect();
      const verticalOverlap = Math.min(rect.bottom, messageRect.bottom) - Math.max(rect.top, messageRect.top);
      if (verticalOverlap <= 0) continue;
      if (rect.right <= messageRect.left && messageRect.left - rect.right <= 90) return "left";
      if (rect.left >= messageRect.right && rect.left - messageRect.right <= 90) return "right";
    }
    return null;
  }

  function lineCopilotDetectMessageRole(candidate, payloadElement, stream) {
    const signal = lineCopilotGetSignal(candidate, stream);
    const scores = { customer: 0, operator: 0, system: 0 };
    const evidence = [];

    if (/(system|notice|announcement|event-message)/.test(signal)) {
      scores.system += 9;
      evidence.push("system DOM 訊號 +9");
    }
    if (/(incoming|received|receive|customer|guest|friend|from-user)/.test(signal)) {
      scores.customer += 8;
      evidence.push("incoming/customer 屬性 +8");
    }
    if (/(outgoing|sent|send|operator|agent|staff|admin|from-self|mine|owner)/.test(signal)) {
      scores.operator += 8;
      evidence.push("outgoing/operator 屬性 +8");
    }

    const rect = payloadElement.getBoundingClientRect();
    const streamRect = stream.getBoundingClientRect();
    const style = window.getComputedStyle(candidate);
    const parentStyle = candidate.parentElement
      ? window.getComputedStyle(candidate.parentElement)
      : null;
    if (style.alignSelf === "flex-end" || style.marginLeft === "auto") {
      scores.operator += 3;
      evidence.push("flex-end／margin-left:auto +3");
    }
    if (style.alignSelf === "flex-start" || style.marginRight === "auto") {
      scores.customer += 2;
      evidence.push("flex-start／margin-right:auto +2");
    }
    if (parentStyle?.justifyContent === "flex-end") {
      scores.operator += 2;
      evidence.push("父層 justify-content:flex-end +2");
    } else if (parentStyle?.justifyContent === "flex-start") {
      scores.customer += 1;
      evidence.push("父層 justify-content:flex-start +1");
    }

    const avatarSide = lineCopilotFindNearbyAvatar(candidate, rect, stream);
    if (avatarSide === "left") {
      scores.customer += 3;
      evidence.push("訊息左側鄰近頭像 +3");
    } else if (avatarSide === "right") {
      scores.operator += 3;
      evidence.push("訊息右側鄰近頭像 +3");
    }

    const centerRatio = (rect.left + rect.width / 2 - streamRect.left) / Math.max(1, streamRect.width);
    if (rect.width < streamRect.width * 0.62 && centerRatio < 0.42) {
      scores.customer += 2;
      evidence.push("明顯位於訊息串左側 +2");
    } else if (rect.width < streamRect.width * 0.62 && centerRatio > 0.58) {
      scores.operator += 2;
      evidence.push("明顯位於訊息串右側 +2");
    }

    const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1]);
    const [topRole, topScore] = ranked[0];
    const secondScore = ranked[1][1];
    if (topScore >= 7 && topScore - secondScore >= 3) {
      return { role: topRole, confidence: "high", evidence, scores };
    }
    if (topScore >= 4 && topScore - secondScore >= 2) {
      return { role: topRole, confidence: "medium", evidence, scores };
    }
    return {
      role: "unknown",
      confidence: "low",
      evidence: [...evidence, "證據分數不足，輸出 unknown"],
      scores
    };
  }

  function lineCopilotFindVisualMessageWrapper(leaf, stream) {
    const streamRect = stream.getBoundingClientRect();
    const streamStyle = window.getComputedStyle(stream);
    let current = leaf;
    let depth = 0;
    let best = null;
    let bestScore = 0;
    while (current && current !== stream && depth < 5) {
      if (!lineCopilotIsElementVisible(current)) break;
      const rect = current.getBoundingClientRect();
      if (
        rect.left >= streamRect.left - 1 &&
        rect.right <= streamRect.right + 1 &&
        rect.width <= streamRect.width * 0.82 &&
        rect.height <= 260
      ) {
        const style = window.getComputedStyle(current);
        const signal = lineCopilotGetSignal(current, stream);
        const background = style.backgroundColor;
        const hasBackground =
          background &&
          background !== "transparent" &&
          background !== "rgba(0, 0, 0, 0)" &&
          background !== streamStyle.backgroundColor;
        const radius = Number.parseFloat(style.borderRadius || "0");
        const directionSignal =
          style.alignSelf === "flex-start" ||
          style.alignSelf === "flex-end" ||
          style.marginLeft === "auto" ||
          style.marginRight === "auto";
        let score = 0;
        if (hasBackground && radius >= 4) score += 4;
        if (directionSignal) score += 3;
        if (/(message|bubble|talk|incoming|outgoing|received|sent)/.test(signal)) score += 5;
        if (current.querySelector("time,[class*='time' i],[data-testid*='time' i]")) score += 2;
        if (score > bestScore) {
          best = current;
          bestScore = score;
        }
      }
      current = current.parentElement;
      depth += 1;
    }
    return bestScore >= 3 ? best : null;
  }

  function detectVisibleMessages(streamResult) {
    return lineCopilotSafeRun(
      "visible message detection",
      () => {
        if (!streamResult.element) {
          return {
            messages: [],
            excludedCandidates: [],
            strategy: "messages:no-stream",
            candidateCount: 0
          };
        }

        const stream = streamResult.element;
        const accepted = [];
        const excluded = [];
        const candidateStrategies = new Map();
        const addCandidate = (candidate, strategy) => {
          if (!candidate || candidate === stream || candidateStrategies.has(candidate)) return;
          candidateStrategies.set(candidate, strategy);
        };

        Array.from(stream.querySelectorAll(LINE_COPILOT_MESSAGE_SELECTOR))
          .slice(0, 900)
          .forEach((candidate) => addCandidate(candidate, "candidate:structural"));

        Array.from(stream.querySelectorAll("p,span,div"))
          .slice(0, 3000)
          .filter((element) => element.children.length === 0)
          .forEach((leaf) => {
            if (
              !lineCopilotIsElementVisible(leaf) ||
              leaf.closest("button,a,menu,nav,header,footer,form,[role='button'],[role='menu'],[role='toolbar']")
            ) {
              return;
            }
            const text = lineCopilotCleanMessageText(leaf.innerText || leaf.textContent);
            if (!text || text.length > 600) return;
            const wrapper = lineCopilotFindVisualMessageWrapper(leaf, stream);
            if (wrapper) addCandidate(wrapper, "candidate:visual-bubble-fallback");
          });

        const candidates = Array.from(candidateStrategies.keys());
        candidates.forEach((candidate) => {
          if (!lineCopilotIsElementVisible(candidate)) {
            excluded.push({ text: "", reason: "not-visible", sourceStrategy: candidateStrategies.get(candidate) });
            return;
          }

          const payload = lineCopilotExtractMessagePayload(candidate);
          const exclusionReason = lineCopilotClassifyExclusion(candidate, payload, stream);
          if (exclusionReason) {
            excluded.push({
              text: payload.text.slice(0, 160),
              reason: exclusionReason,
              sourceStrategy: candidateStrategies.get(candidate)
            });
            return;
          }

          const rect = payload.sourceElement.getBoundingClientRect();
          const streamRect = stream.getBoundingClientRect();
          if (
            rect.left < streamRect.left - 1 ||
            rect.right > streamRect.right + 1 ||
            rect.top < streamRect.top - 1 ||
            rect.bottom > streamRect.bottom + 1
          ) {
            excluded.push({
              text: payload.text.slice(0, 160),
              reason: "outside-visible-stream-bounds",
              sourceStrategy: candidateStrategies.get(candidate)
            });
            return;
          }

          const rawText = lineCopilotNormalizeText(candidate.innerText || candidate.textContent);
          const time = lineCopilotExtractMessageTime(candidate, rawText, stream);
          const roleResult = lineCopilotDetectMessageRole(candidate, payload.sourceElement, stream);
          let detectionScore = payload.strategy === "text:dedicated-message-node" ? 60 : 35;
          if (candidateStrategies.get(candidate) === "candidate:visual-bubble-fallback") detectionScore += 18;
          if (candidate.hasAttribute("data-message-id")) detectionScore += 30;
          if (candidate.hasAttribute("data-direction")) detectionScore += 20;
          if (time) detectionScore += 5;

          accepted.push({
            text: payload.text,
            role: roleResult.role,
            time,
            confidence: roleResult.confidence,
            sourceStrategy: `${candidateStrategies.get(candidate)}; ${payload.strategy}; ${roleResult.evidence.join("; ")}`,
            roleEvidence: roleResult.evidence,
            roleScores: roleResult.scores,
            detectionScore,
            top: rect.top,
            bottom: rect.bottom
          });
        });

        const unique = new Map();
        const confidenceRank = { high: 3, medium: 2, low: 1 };
        accepted.forEach((message) => {
          const key = `${message.text}\u0000${message.time || ""}`;
          const existing = unique.get(key);
          const quality = message.detectionScore + confidenceRank[message.confidence] * 5;
          const existingQuality = existing
            ? existing.detectionScore + confidenceRank[existing.confidence] * 5
            : -1;
          if (!existing || quality > existingQuality) unique.set(key, message);
        });

        const messages = Array.from(unique.values())
          .sort((left, right) => left.bottom - right.bottom || left.top - right.top)
          .slice(-LINE_COPILOT_MESSAGE_LIMIT)
          .map(({ text, role, time, confidence, sourceStrategy, roleEvidence, roleScores }) => ({
            text,
            role,
            time,
            confidence,
            sourceStrategy,
            roleEvidence,
            roleScores
          }));
        return {
          messages,
          excludedCandidates: excluded.slice(0, 40),
          strategy: `messages:structural-plus-visual-fallback-in-${streamResult.strategy}`,
          candidateCount: candidates.length
        };
      },
      {
        messages: [],
        excludedCandidates: [],
        strategy: "messages:error",
        candidateCount: 0
      }
    );
  }

  function lineCopilotRecordSuccessfulContact(contactResult, conversationId, detectedAt) {
    if (!contactResult?.value) return LINE_COPILOT_EMPTY_VALUE;
    lineCopilotRuntime.lastSuccessfulContact = {
      conversationId: conversationId || null,
      name: contactResult.value,
      source: contactResult.source,
      confidence: contactResult.confidence,
      at: detectedAt
    };
    return detectedAt;
  }

  function detectChatState() {
    const detectedAt = lineCopilotFormatTimestamp();
    const currentUrl = window.location.href;
    const isChatHost = window.location.hostname === "chat.line.biz";
    if (!isChatHost) {
      return {
        isOpen: false,
        contactName: LINE_COPILOT_EMPTY_VALUE,
        contactNameSource: "unknown",
        contactNameConfidence: "low",
        contactNameDetectedAt: LINE_COPILOT_EMPTY_VALUE,
        currentUrl,
        conversationId: LINE_COPILOT_EMPTY_VALUE,
        detectedAt,
        messages: [],
        contactNameCandidates: [],
        headerCandidateElements: [],
        excludedCandidates: [],
        debug: {
          nameCandidateCount: 0,
          messageCandidateCount: 0,
          streamCandidateCount: 0,
          strategy: "host:manager-page-only",
          contactSelectionReason: "不在 chat.line.biz",
          lastDomUpdateAt: lineCopilotRuntime.lastDomUpdateAt
        }
      };
    }

    const conversationResult = detectConversationId();
    const streamResult = lineCopilotFindMessageStream();
    const contactResult = detectContactName(streamResult);
    const messagesResult = detectVisibleMessages(streamResult);
    const isOpen = Boolean(
      conversationResult.value || contactResult.value || messagesResult.messages.length
    );
    const contactNameDetectedAt = lineCopilotRecordSuccessfulContact(
      contactResult,
      conversationResult.value,
      detectedAt
    );
    return {
      isOpen,
      contactName: contactResult.value || LINE_COPILOT_EMPTY_VALUE,
      contactNameSource: contactResult.source || "unknown",
      contactNameConfidence: contactResult.confidence || "low",
      contactNameDetectedAt,
      currentUrl,
      conversationId: conversationResult.value || LINE_COPILOT_EMPTY_VALUE,
      detectedAt,
      messages: messagesResult.messages,
      contactNameCandidates: contactResult.candidates,
      headerCandidateElements: contactResult.headerCandidates,
      excludedCandidates: messagesResult.excludedCandidates,
      debug: {
        nameCandidateCount: contactResult.candidateCount,
        messageCandidateCount: messagesResult.candidateCount,
        streamCandidateCount: streamResult.candidateCount,
        strategy: [
          conversationResult.strategy,
          streamResult.strategy,
          contactResult.strategy,
          messagesResult.strategy
        ].join(" / "),
        contactSelectionReason: contactResult.selectionReason,
        lastDomUpdateAt: lineCopilotRuntime.lastDomUpdateAt
      }
    };
  }

  function lineCopilotSetText(id, value) {
    const element = document.getElementById(id);
    if (element) {
      const displayValue = value || LINE_COPILOT_EMPTY_VALUE;
      element.textContent = displayValue;
      element.title = displayValue;
    }
  }

  function lineCopilotRoleLabel(role) {
    if (role === "customer") return "客戶";
    if (role === "operator") return "客服";
    if (role === "system") return "系統";
    return "未知";
  }

  function lineCopilotRenderMessages(messages) {
    const list = document.getElementById("line-copilot-message-list");
    if (!list) return;
    list.replaceChildren();
    if (!messages.length) {
      const empty = document.createElement("li");
      empty.className = "line-copilot-message-empty";
      empty.textContent = LINE_COPILOT_EMPTY_VALUE;
      list.appendChild(empty);
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
      const confidence = document.createElement("span");
      confidence.className = `line-copilot-confidence line-copilot-confidence-${message.confidence}`;
      confidence.textContent = message.confidence;
      const time = document.createElement("time");
      time.className = "line-copilot-message-time";
      time.textContent = message.time || LINE_COPILOT_EMPTY_VALUE;
      const text = document.createElement("p");
      text.className = "line-copilot-message-text";
      text.textContent = message.text;
      meta.append(role, confidence, time);
      item.append(meta, text);
      list.appendChild(item);
    });
  }

  function lineCopilotRenderNameCandidates(candidates) {
    const list = document.getElementById("line-copilot-debug-name-candidates");
    if (!list) return;
    list.replaceChildren();
    if (!candidates.length) {
      const item = document.createElement("li");
      item.className = "line-copilot-debug-empty";
      item.textContent = LINE_COPILOT_EMPTY_VALUE;
      list.appendChild(item);
      return;
    }
    candidates.forEach((candidate) => {
      const item = document.createElement("li");
      item.className = "line-copilot-debug-list-item";
      item.textContent = `${candidate.text} — ${candidate.score} 分 — ${candidate.source || "unknown"} — ${candidate.evidence.join("；")}`;
      list.appendChild(item);
    });
  }

  function lineCopilotRenderHeaderCandidates(candidates) {
    const list = document.getElementById("line-copilot-debug-header-candidates");
    if (!list) return;
    list.replaceChildren();
    const visibleCandidates = (candidates || []).slice(0, 30);
    if (!visibleCandidates.length) {
      const item = document.createElement("li");
      item.className = "line-copilot-debug-empty";
      item.textContent = LINE_COPILOT_EMPTY_VALUE;
      list.appendChild(item);
      return;
    }
    visibleCandidates.forEach((candidate) => {
      const item = document.createElement("li");
      item.className = "line-copilot-debug-list-item line-copilot-debug-header-item";
      item.textContent = JSON.stringify(candidate, null, 2);
      list.appendChild(item);
    });
  }

  function lineCopilotRenderExcludedCandidates(candidates) {
    const list = document.getElementById("line-copilot-debug-excluded");
    if (!list) return;
    list.replaceChildren();
    const visibleCandidates = candidates.filter((candidate) => candidate.text).slice(0, 20);
    if (!visibleCandidates.length) {
      const item = document.createElement("li");
      item.className = "line-copilot-debug-empty";
      item.textContent = LINE_COPILOT_EMPTY_VALUE;
      list.appendChild(item);
      return;
    }
    visibleCandidates.forEach((candidate) => {
      const item = document.createElement("li");
      item.className = "line-copilot-debug-list-item";
      item.textContent = `${candidate.text} — 排除：${candidate.reason}`;
      list.appendChild(item);
    });
  }

  function lineCopilotRenderRoleDiagnostics(messages) {
    const list = document.getElementById("line-copilot-debug-role-evidence");
    if (!list) return;
    list.replaceChildren();
    if (!messages.length) {
      const item = document.createElement("li");
      item.className = "line-copilot-debug-empty";
      item.textContent = LINE_COPILOT_EMPTY_VALUE;
      list.appendChild(item);
      return;
    }
    messages.forEach((message) => {
      const item = document.createElement("li");
      item.className = "line-copilot-debug-list-item";
      item.textContent = `${message.text} — ${message.role}/${message.confidence} — ${message.roleEvidence.join("；")}`;
      list.appendChild(item);
    });
  }

  function updateCopilotPanel(state) {
    lineCopilotRuntime.latestState = state;
    const statusCard = document.getElementById("line-copilot-status-card");
    statusCard?.classList.toggle("line-copilot-status-inactive", !state.isOpen);
    lineCopilotSetText(
      "line-copilot-status-text",
      state.isOpen ? "已開啟聊天室" : "尚未偵測到聊天室"
    );
    lineCopilotSetText("line-copilot-chat-open", state.isOpen ? "是" : LINE_COPILOT_EMPTY_VALUE);
    lineCopilotSetText("line-copilot-contact-name", state.contactName);
    lineCopilotSetText("line-copilot-contact-source", state.contactNameSource);
    lineCopilotSetText("line-copilot-contact-confidence", state.contactNameConfidence);
    lineCopilotSetText("line-copilot-contact-success-time", state.contactNameDetectedAt);
    lineCopilotSetText("line-copilot-current-url", state.currentUrl);
    lineCopilotSetText("line-copilot-conversation-id", state.conversationId);
    lineCopilotSetText("line-copilot-detected-at", state.detectedAt);
    lineCopilotSetText("line-copilot-debug-name-count", String(state.debug.nameCandidateCount));
    lineCopilotSetText("line-copilot-debug-message-count", String(state.debug.messageCandidateCount));
    lineCopilotSetText("line-copilot-debug-stream-count", String(state.debug.streamCandidateCount));
    lineCopilotSetText("line-copilot-debug-strategy", state.debug.strategy);
    lineCopilotSetText("line-copilot-debug-selection-reason", state.debug.contactSelectionReason);
    lineCopilotSetText("line-copilot-debug-dom-time", state.debug.lastDomUpdateAt);
    lineCopilotRenderMessages(state.messages);
    lineCopilotRenderNameCandidates(state.contactNameCandidates);
    lineCopilotRenderHeaderCandidates(state.headerCandidateElements);
    lineCopilotRenderExcludedCandidates(state.excludedCandidates);
    lineCopilotRenderRoleDiagnostics(state.messages);
  }

  function lineCopilotBuildDiagnosticReport(state) {
    return {
      currentUrl: state?.currentUrl || window.location.href,
      detectedContactName:
        state?.contactName && state.contactName !== LINE_COPILOT_EMPTY_VALUE
          ? state.contactName
          : null,
      contactNameCandidates: (state?.contactNameCandidates || []).map((candidate) => ({
        text: candidate.text,
        score: candidate.score,
        evidence: [...candidate.evidence]
      })),
      conversationId:
        state?.conversationId && state.conversationId !== LINE_COPILOT_EMPTY_VALUE
          ? state.conversationId
          : null,
      detectedMessages: (state?.messages || []).map((message) => ({
        text: message.text,
        role: message.role,
        time: message.time,
        confidence: message.confidence,
        sourceStrategy: message.sourceStrategy
      })),
      excludedCandidates: (state?.excludedCandidates || []).map((candidate) => ({
        text: candidate.text,
        reason: candidate.reason,
        sourceStrategy: candidate.sourceStrategy
      })),
      timestamp: new Date().toISOString()
    };
  }

  async function lineCopilotCopyDiagnosticReport() {
    const result = document.getElementById("line-copilot-debug-export-result");
    try {
      const report = lineCopilotBuildDiagnosticReport(lineCopilotRuntime.latestState);
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      if (result) result.textContent = "偵測報告已複製到剪貼簿";
    } catch (error) {
      console.warn("LINE COPILOT diagnostic copy failed", error);
      if (result) result.textContent = "無法複製偵測報告，請確認剪貼簿權限";
    }
  }

  function lineCopilotBuildHeaderDiagnosticReport(state) {
    return {
      url: state?.currentUrl || window.location.href,
      conversationId:
        state?.conversationId && state.conversationId !== LINE_COPILOT_EMPTY_VALUE
          ? state.conversationId
          : null,
      selectedName:
        state?.contactName && state.contactName !== LINE_COPILOT_EMPTY_VALUE
          ? state.contactName
          : null,
      selectedStrategy: state?.contactNameSource || "unknown",
      candidates: (state?.headerCandidateElements || []).slice(0, 30).map((candidate) => ({
        ...candidate,
        boundingClientRect: { ...candidate.boundingClientRect }
      })),
      timestamp: new Date().toISOString()
    };
  }

  async function lineCopilotCopyHeaderDiagnosticReport() {
    const result = document.getElementById("line-copilot-header-export-result");
    try {
      const report = lineCopilotBuildHeaderDiagnosticReport(lineCopilotRuntime.latestState);
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      if (result) result.textContent = "Header 診斷 JSON 已複製到剪貼簿";
    } catch (error) {
      console.warn("LINE COPILOT header diagnostic copy failed", error);
      if (result) result.textContent = "無法複製 Header 診斷 JSON，請確認剪貼簿權限";
    }
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
            <div class="line-copilot-heading-copy"><h1 class="line-copilot-title">LINE COPILOT</h1><span class="line-copilot-subtitle">精準聊天室偵測</span></div>
          </div>
          <button id="line-copilot-collapse-button" class="line-copilot-icon-button" type="button" aria-label="收合 LINE COPILOT 面板" title="收合面板">›</button>
        </header>
        <main class="line-copilot-content">
          <div id="line-copilot-status-card" class="line-copilot-status-card"><span class="line-copilot-status-dot" aria-hidden="true"></span><span id="line-copilot-status-text" class="line-copilot-status-text">偵測中</span></div>
          <section class="line-copilot-detector-section" aria-labelledby="line-copilot-chat-heading">
            <h2 id="line-copilot-chat-heading" class="line-copilot-section-title">目前聊天室</h2>
            <dl class="line-copilot-detail-list">
              <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">已開啟</dt><dd id="line-copilot-chat-open" class="line-copilot-detail-value">偵測中</dd></div>
              <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">聊天對象</dt><dd id="line-copilot-contact-name" class="line-copilot-detail-value">偵測中</dd></div>
              <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">偵測來源</dt><dd id="line-copilot-contact-source" class="line-copilot-detail-value line-copilot-detail-mono">unknown</dd></div>
              <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">信心程度</dt><dd id="line-copilot-contact-confidence" class="line-copilot-detail-value">low</dd></div>
              <div class="line-copilot-detail-row line-copilot-detail-row-stacked"><dt class="line-copilot-detail-label">最後成功偵測時間</dt><dd id="line-copilot-contact-success-time" class="line-copilot-detail-value">尚未偵測到</dd></div>
              <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">聊天室 ID</dt><dd id="line-copilot-conversation-id" class="line-copilot-detail-value line-copilot-detail-mono">偵測中</dd></div>
              <div class="line-copilot-detail-row line-copilot-detail-row-stacked"><dt class="line-copilot-detail-label">目前網址</dt><dd id="line-copilot-current-url" class="line-copilot-detail-value line-copilot-detail-mono">偵測中</dd></div>
              <div class="line-copilot-detail-row line-copilot-detail-row-stacked"><dt class="line-copilot-detail-label">最後偵測時間</dt><dd id="line-copilot-detected-at" class="line-copilot-detail-value">偵測中</dd></div>
            </dl>
          </section>
          <section class="line-copilot-detector-section" aria-labelledby="line-copilot-messages-heading">
            <div class="line-copilot-section-heading-row"><h2 id="line-copilot-messages-heading" class="line-copilot-section-title">最近可見訊息</h2><span class="line-copilot-section-note">最多 5 則</span></div>
            <ol id="line-copilot-message-list" class="line-copilot-message-list" aria-live="polite"><li class="line-copilot-message-empty">偵測中</li></ol>
          </section>
          <button id="line-copilot-debug-toggle" class="line-copilot-secondary-button" type="button" aria-expanded="false" aria-controls="line-copilot-debug-panel">顯示偵錯資訊</button>
          <section id="line-copilot-debug-panel" class="line-copilot-debug-panel" hidden>
            <h2 class="line-copilot-section-title">偵錯資訊</h2>
            <dl class="line-copilot-detail-list">
              <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">訊息串候選</dt><dd id="line-copilot-debug-stream-count" class="line-copilot-detail-value">0</dd></div>
              <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">名稱候選</dt><dd id="line-copilot-debug-name-count" class="line-copilot-detail-value">0</dd></div>
              <div class="line-copilot-detail-row"><dt class="line-copilot-detail-label">訊息候選</dt><dd id="line-copilot-debug-message-count" class="line-copilot-detail-value">0</dd></div>
              <div class="line-copilot-detail-row line-copilot-detail-row-stacked"><dt class="line-copilot-detail-label">名稱選擇原因</dt><dd id="line-copilot-debug-selection-reason" class="line-copilot-detail-value">尚未偵測到</dd></div>
              <div class="line-copilot-detail-row line-copilot-detail-row-stacked"><dt class="line-copilot-detail-label">偵測策略</dt><dd id="line-copilot-debug-strategy" class="line-copilot-detail-value line-copilot-detail-mono">尚未偵測到</dd></div>
              <div class="line-copilot-detail-row line-copilot-detail-row-stacked"><dt class="line-copilot-detail-label">最近 DOM 更新</dt><dd id="line-copilot-debug-dom-time" class="line-copilot-detail-value">尚未偵測到</dd></div>
            </dl>
            <h3 class="line-copilot-debug-heading">聊天室 Header 候選元素</h3><ol id="line-copilot-debug-header-candidates" class="line-copilot-debug-list"><li class="line-copilot-debug-empty">尚未偵測到</li></ol>
            <button id="line-copilot-copy-header-report" class="line-copilot-secondary-button" type="button">複製 Header 診斷 JSON</button>
            <p id="line-copilot-header-export-result" class="line-copilot-debug-export-result" role="status" aria-live="polite"></p>
            <h3 class="line-copilot-debug-heading">名稱候選與評分</h3><ol id="line-copilot-debug-name-candidates" class="line-copilot-debug-list"><li class="line-copilot-debug-empty">尚未偵測到</li></ol>
            <h3 class="line-copilot-debug-heading">角色判斷依據</h3><ol id="line-copilot-debug-role-evidence" class="line-copilot-debug-list"><li class="line-copilot-debug-empty">尚未偵測到</li></ol>
            <h3 class="line-copilot-debug-heading">已排除候選</h3><ol id="line-copilot-debug-excluded" class="line-copilot-debug-list"><li class="line-copilot-debug-empty">尚未偵測到</li></ol>
            <button id="line-copilot-export-report" class="line-copilot-secondary-button" type="button">匯出偵測報告</button>
            <p id="line-copilot-debug-export-result" class="line-copilot-debug-export-result" role="status" aria-live="polite"></p>
          </section>
          <button id="line-copilot-test-button" class="line-copilot-primary-button" type="button">測試功能</button>
          <p id="line-copilot-test-result" class="line-copilot-test-result" role="status" aria-live="polite"></p>
        </main>
        <footer class="line-copilot-footer"><p class="line-copilot-privacy">目前僅在瀏覽器本機偵測畫面內容，資料不會傳送到外部伺服器。</p><button id="line-copilot-close-button" class="line-copilot-secondary-button" type="button">關閉面板</button><span class="line-copilot-version">v1.2.0</span></footer>
      </section>
    `;

    root.querySelector("#line-copilot-collapse-button").addEventListener("click", () => lineCopilotSetCollapsed(root, true));
    root.querySelector("#line-copilot-close-button").addEventListener("click", () => lineCopilotSetCollapsed(root, true));
    root.querySelector("#line-copilot-expand-button").addEventListener("click", () => lineCopilotSetCollapsed(root, false));
    root.querySelector("#line-copilot-test-button").addEventListener("click", () => lineCopilotSetText("line-copilot-test-result", "LINE COPILOT 測試成功"));
    root.querySelector("#line-copilot-export-report").addEventListener("click", lineCopilotCopyDiagnosticReport);
    root.querySelector("#line-copilot-copy-header-report").addEventListener("click", lineCopilotCopyHeaderDiagnosticReport);
    root.querySelector("#line-copilot-debug-toggle").addEventListener("click", (event) => {
      const panel = root.querySelector("#line-copilot-debug-panel");
      const expanded = event.currentTarget.getAttribute("aria-expanded") === "true";
      event.currentTarget.setAttribute("aria-expanded", String(!expanded));
      event.currentTarget.textContent = expanded ? "顯示偵錯資訊" : "隱藏偵錯資訊";
      panel.hidden = expanded;
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

  function lineCopilotCancelContactNameRetries() {
    lineCopilotRuntime.contactRetryTimers.forEach((timerId) => window.clearTimeout(timerId));
    lineCopilotRuntime.contactRetryTimers = [];
  }

  function lineCopilotApplyContactResult(baseState, contactResult, conversationResult, streamResult) {
    const detectedAt = lineCopilotFormatTimestamp();
    const contactNameDetectedAt = lineCopilotRecordSuccessfulContact(
      contactResult,
      conversationResult.value,
      detectedAt
    );
    return {
      ...baseState,
      isOpen: Boolean(baseState.isOpen || conversationResult.value || contactResult.value),
      contactName: contactResult.value || LINE_COPILOT_EMPTY_VALUE,
      contactNameSource: contactResult.source || "unknown",
      contactNameConfidence: contactResult.confidence || "low",
      contactNameDetectedAt,
      currentUrl: window.location.href,
      conversationId: conversationResult.value || LINE_COPILOT_EMPTY_VALUE,
      detectedAt,
      contactNameCandidates: contactResult.candidates,
      headerCandidateElements: contactResult.headerCandidates,
      debug: {
        ...baseState.debug,
        nameCandidateCount: contactResult.candidateCount,
        streamCandidateCount: streamResult.candidateCount,
        strategy: `${conversationResult.strategy} / ${streamResult.strategy} / ${contactResult.strategy} / contact-name-retry`,
        contactSelectionReason: contactResult.selectionReason,
        lastDomUpdateAt: lineCopilotRuntime.lastDomUpdateAt
      }
    };
  }

  function lineCopilotRunContactNameDetection(reason) {
    lineCopilotRuntime.pendingReason = reason;
    if (!lineCopilotEnsurePanel()) return false;
    const conversationResult = detectConversationId();
    const streamResult = lineCopilotFindMessageStream();
    const contactResult = detectContactName(streamResult);
    const baseState =
      lineCopilotRuntime.latestState?.currentUrl === window.location.href
        ? lineCopilotRuntime.latestState
        : detectChatState();
    const state = lineCopilotApplyContactResult(
      baseState,
      contactResult,
      conversationResult,
      streamResult
    );
    updateCopilotPanel(state);
    if (contactResult.value) lineCopilotCancelContactNameRetries();
    return Boolean(contactResult.value);
  }

  function lineCopilotScheduleContactNameRetries(reason) {
    lineCopilotCancelContactNameRetries();
    const scheduledUrl = window.location.href;
    LINE_COPILOT_CONTACT_RETRY_DELAYS.forEach((delay) => {
      const timerId = window.setTimeout(() => {
        if (window.location.href !== scheduledUrl) return;
        lineCopilotRunContactNameDetection(`${reason}:${delay}ms`);
      }, delay);
      lineCopilotRuntime.contactRetryTimers.push(timerId);
    });
  }

  function lineCopilotRunDetection(reason) {
    lineCopilotRuntime.pendingReason = reason;
    if (!lineCopilotEnsurePanel()) return null;
    const state = detectChatState();
    updateCopilotPanel(state);
    if (state.contactName !== LINE_COPILOT_EMPTY_VALUE) {
      lineCopilotCancelContactNameRetries();
    }
    return state;
  }

  function lineCopilotScheduleDetection(reason) {
    lineCopilotRuntime.pendingReason = reason;
    window.clearTimeout(lineCopilotRuntime.debounceId);
    lineCopilotRuntime.debounceId = window.setTimeout(
      () => lineCopilotRunDetection(lineCopilotRuntime.pendingReason),
      LINE_COPILOT_DEBOUNCE_MS
    );
  }

  function lineCopilotPatchHistory() {
    ["pushState", "replaceState"].forEach((methodName) => {
      const original = window.history[methodName];
      if (original.__lineCopilotPatched) return;
      const patched = function (...args) {
        const result = original.apply(this, args);
        window.dispatchEvent(new CustomEvent(LINE_COPILOT_NAVIGATION_EVENT));
        return result;
      };
      Object.defineProperty(patched, "__lineCopilotPatched", { value: true });
      window.history[methodName] = patched;
    });
  }

  function observeLinePageChanges() {
    lineCopilotPatchHistory();
    const observer = new MutationObserver((mutations) => {
      const root = document.getElementById(LINE_COPILOT_ROOT_ID);
      const external = mutations.some((mutation) => !(root && root.contains(mutation.target)));
      if (!root) lineCopilotEnsurePanel();
      if (external) {
        lineCopilotRuntime.lastDomUpdateAt = lineCopilotFormatTimestamp();
        lineCopilotScheduleDetection("dom-mutation");
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "aria-selected", "title", "data-direction"]
    });

    const navigationHandler = () => {
      lineCopilotRuntime.lastUrl = window.location.href;
      lineCopilotScheduleContactNameRetries("navigation");
      lineCopilotScheduleDetection("navigation");
    };
    window.addEventListener(LINE_COPILOT_NAVIGATION_EVENT, navigationHandler);
    window.addEventListener("popstate", navigationHandler);
    window.addEventListener("hashchange", navigationHandler);
    if (window.navigation?.addEventListener) {
      window.navigation.addEventListener("navigate", navigationHandler);
    }

    const intervalId = window.setInterval(() => {
      lineCopilotEnsurePanel();
      if (lineCopilotRuntime.lastUrl !== window.location.href) {
        lineCopilotRuntime.lastUrl = window.location.href;
        lineCopilotScheduleContactNameRetries("url-poll");
        lineCopilotScheduleDetection("url-poll");
      }
    }, 1000);
    return { observer, intervalId };
  }

  lineCopilotEnsurePanel();
  const lineCopilotInitialState = lineCopilotRunDetection("initial-load");
  if (lineCopilotInitialState?.contactName === LINE_COPILOT_EMPTY_VALUE) {
    lineCopilotScheduleContactNameRetries("initial-load");
  }
  if (!window[LINE_COPILOT_MONITOR_KEY]) {
    window[LINE_COPILOT_MONITOR_KEY] = observeLinePageChanges();
  }
})();
