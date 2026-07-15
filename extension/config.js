"use strict";

const LINE_COPILOT_CONFIG = Object.freeze({
  API_BASE_URL: "",
  MLM_API_BASE_URL: "https://mlm.fangwl591021.workers.dev",
  USE_MLM_KNOWLEDGE: true,
  MLM_KNOWLEDGE_URL:
    "https://raw.githubusercontent.com/fangwl591021/MLM/main/data/knowledge-base.json",
  USE_MOCK_API: true,
  REQUEST_TIMEOUT_MS: 30000,
  MAX_VISIBLE_MESSAGES: 5
});

globalThis.LINE_COPILOT_CONFIG = LINE_COPILOT_CONFIG;
