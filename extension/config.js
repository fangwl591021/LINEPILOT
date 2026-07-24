"use strict";

const LINE_COPILOT_CONFIG = Object.freeze({
  API_BASE_URL: "",
  PLATFORM_API_BASE_URL: "https://line-oa.fangwl591021.workers.dev",
  USE_CLOUD_KNOWLEDGE: true,
  USE_MOCK_API: false,
  REQUEST_TIMEOUT_MS: 30000,
  MAX_VISIBLE_MESSAGES: 5
});

globalThis.LINE_COPILOT_CONFIG = LINE_COPILOT_CONFIG;
