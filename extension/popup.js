(() => {
  "use strict";

  const lineCopilotVersion = document.getElementById("line-copilot-popup-version");
  lineCopilotVersion.textContent = chrome.runtime.getManifest().version;
})();
