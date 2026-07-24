(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  let mode = "register";

  $("version").textContent = chrome.runtime.getManifest().version;
  $("register-tab").addEventListener("click", () => setMode("register"));
  $("login-tab").addEventListener("click", () => setMode("login"));
  $("auth-form").addEventListener("submit", submit);
  $("logout").addEventListener("click", () => send({ type: "LINEPILOT_LOGOUT" }).then(() => location.reload()));
  $("dashboard").addEventListener("click", () => chrome.tabs.create({ url: "https://line-oa.fangwl591021.workers.dev/app" }));

  function setMode(next) {
    mode = next;
    $("register-tab").classList.toggle("active", mode === "register");
    $("login-tab").classList.toggle("active", mode === "login");
    $("register-fields").classList.toggle("hidden", mode !== "register");
    $("submit").textContent = mode === "register" ? "註冊並啟用免費版" : "登入";
    showNotice("");
  }

  async function submit(event) {
    event.preventDefault();
    $("submit").disabled = true;
    showNotice(mode === "register" ? "正在建立免費帳號…" : "正在登入…");
    try {
      const response = await send({
        type: mode === "register" ? "LINEPILOT_REGISTER" : "LINEPILOT_LOGIN",
        email: $("email").value,
        password: $("password").value,
        displayName: $("displayName").value,
        companyName: $("companyName").value
      });
      renderProfile(response.user);
    } catch (error) {
      showNotice(error.message || "操作失敗", true);
    } finally {
      $("submit").disabled = false;
    }
  }

  function send(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) reject(new Error(runtimeError.message));
        else if (!response?.ok) reject(new Error(response?.error || "操作失敗"));
        else resolve(response);
      });
    });
  }

  function showNotice(text, error = false) {
    $("notice").textContent = text;
    $("notice").className = text ? `notice${error ? " error" : ""}` : "notice hidden";
  }

  function renderProfile(user) {
    $("auth").classList.add("hidden");
    $("profile").classList.remove("hidden");
    $("profile-name").textContent = user?.displayName || "LINEPILOT 使用者";
    $("profile-email").textContent = user?.email || "";
  }

  send({ type: "LINEPILOT_AUTH_STATUS" }).then((response) => {
    if (response.authenticated) renderProfile(response.user);
  }).catch(() => {});
})();
