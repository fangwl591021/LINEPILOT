(() => {
  "use strict";

  const LINE_COPILOT_ROOT_ID = "line-copilot-root";
  const LINE_COPILOT_URL_ID = "line-copilot-current-url";
  const LINE_COPILOT_RESULT_ID = "line-copilot-test-result";
  const LINE_COPILOT_COLLAPSED_CLASS = "line-copilot-collapsed";
  const LINE_COPILOT_MONITOR_KEY = "__lineCopilotMonitor";

  console.log("LINE COPILOT Loaded");

  function lineCopilotUpdateUrl() {
    const lineCopilotUrl = document.getElementById(LINE_COPILOT_URL_ID);
    if (lineCopilotUrl && lineCopilotUrl.textContent !== window.location.href) {
      lineCopilotUrl.textContent = window.location.href;
      lineCopilotUrl.title = window.location.href;
    }
  }

  function lineCopilotSetCollapsed(lineCopilotRoot, lineCopilotCollapsed) {
    lineCopilotRoot.classList.toggle(
      LINE_COPILOT_COLLAPSED_CLASS,
      lineCopilotCollapsed
    );
    lineCopilotRoot.setAttribute("aria-expanded", String(!lineCopilotCollapsed));
  }

  function lineCopilotCreatePanel() {
    const lineCopilotRoot = document.createElement("aside");
    lineCopilotRoot.id = LINE_COPILOT_ROOT_ID;
    lineCopilotRoot.className = "line-copilot-root";
    lineCopilotRoot.setAttribute("aria-label", "LINE COPILOT 面板");
    lineCopilotRoot.setAttribute("aria-expanded", "true");

    lineCopilotRoot.innerHTML = `
      <button
        id="line-copilot-expand-button"
        class="line-copilot-expand-button"
        type="button"
        aria-label="展開 LINE COPILOT 面板"
        title="展開 LINE COPILOT"
      >LC</button>
      <section class="line-copilot-panel">
        <header class="line-copilot-header">
          <div class="line-copilot-heading-group">
            <span class="line-copilot-brand-mark" aria-hidden="true">LC</span>
            <h1 class="line-copilot-title">LINE COPILOT</h1>
          </div>
          <button
            id="line-copilot-collapse-button"
            class="line-copilot-icon-button"
            type="button"
            aria-label="收合 LINE COPILOT 面板"
            title="收合面板"
          >›</button>
        </header>
        <main class="line-copilot-content">
          <div class="line-copilot-status-card">
            <span class="line-copilot-status-dot" aria-hidden="true"></span>
            <span class="line-copilot-status-text">已偵測 LINE OA 管理頁面</span>
          </div>
          <div class="line-copilot-info-group">
            <span class="line-copilot-label">目前網址</span>
            <p id="line-copilot-current-url" class="line-copilot-url"></p>
          </div>
          <button
            id="line-copilot-test-button"
            class="line-copilot-primary-button"
            type="button"
          >測試功能</button>
          <p
            id="line-copilot-test-result"
            class="line-copilot-test-result"
            role="status"
            aria-live="polite"
          ></p>
        </main>
        <footer class="line-copilot-footer">
          <button
            id="line-copilot-close-button"
            class="line-copilot-secondary-button"
            type="button"
          >關閉面板</button>
          <span class="line-copilot-version">v1.0.0</span>
        </footer>
      </section>
    `;

    lineCopilotRoot
      .querySelector("#line-copilot-collapse-button")
      .addEventListener("click", () => lineCopilotSetCollapsed(lineCopilotRoot, true));

    lineCopilotRoot
      .querySelector("#line-copilot-close-button")
      .addEventListener("click", () => lineCopilotSetCollapsed(lineCopilotRoot, true));

    lineCopilotRoot
      .querySelector("#line-copilot-expand-button")
      .addEventListener("click", () => lineCopilotSetCollapsed(lineCopilotRoot, false));

    lineCopilotRoot
      .querySelector("#line-copilot-test-button")
      .addEventListener("click", () => {
        const lineCopilotResult = lineCopilotRoot.querySelector(
          `#${LINE_COPILOT_RESULT_ID}`
        );
        lineCopilotResult.textContent = "LINE COPILOT 測試成功";
      });

    return lineCopilotRoot;
  }

  function lineCopilotEnsurePanel() {
    if (!document.body) {
      return;
    }

    let lineCopilotRoot = document.getElementById(LINE_COPILOT_ROOT_ID);
    if (!lineCopilotRoot) {
      lineCopilotRoot = lineCopilotCreatePanel();
      document.body.appendChild(lineCopilotRoot);
    }

    lineCopilotUpdateUrl();
  }

  lineCopilotEnsurePanel();

  if (!window[LINE_COPILOT_MONITOR_KEY]) {
    const lineCopilotObserver = new MutationObserver(() => {
      lineCopilotEnsurePanel();
    });

    lineCopilotObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    const lineCopilotIntervalId = window.setInterval(() => {
      lineCopilotEnsurePanel();
    }, 1000);

    window.addEventListener("popstate", lineCopilotEnsurePanel);
    window.addEventListener("hashchange", lineCopilotEnsurePanel);

    window[LINE_COPILOT_MONITOR_KEY] = {
      observer: lineCopilotObserver,
      intervalId: lineCopilotIntervalId
    };
  }
})();
