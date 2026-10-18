(async () => {
  "use strict";
  const status = document.getElementById("bootstrap-status");
  const details = document.getElementById("bootstrap-details");
  const diagnostics = document.getElementById("webview-diagnostics");
  if (diagnostics) diagnostics.addEventListener("click", async function () {
    if (diagnostics.disabled) return;
    diagnostics.disabled = true;
    diagnostics.setAttribute("aria-busy", "true");
    try {
      const invoke = window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke;
      if (typeof invoke !== "function") throw new Error("原生入口未就绪，请重新打开 bilikara。");
      await invoke("android_webview_diagnostics");
    } catch (error) { status.textContent = (error && error.message) || String(error); }
    finally { diagnostics.disabled = false; diagnostics.removeAttribute("aria-busy"); }
  });
  var starting = false, needsDiagnostics = false;
  window.bilikaraStartLegacy = function () {
    if (starting) return false;
    start(true);
    return true;
  };
  async function start(legacy) {
    starting = true;
    needsDiagnostics = false;
    try {
      if (legacy && (typeof AbortController !== "function" || typeof crypto !== "object"
        || typeof crypto.getRandomValues !== "function" || typeof Promise.allSettled !== "function"
        || typeof String.prototype.replaceAll !== "function" || typeof ResizeObserver !== "function"
        || typeof Element.prototype.getAnimations !== "function" || !CSS.supports("inset: 0px")
        || !CSS.supports("aspect-ratio: 16 / 9"))) {
        throw new Error("当前内核未满足 legacy 的 WebView 91 能力要求，请复制自检信息。无需清除应用数据。");
      }
      // Keep this bootstrap parseable by older WebViews so an unsupported engine
      // gets an actionable message before loading the shared modern Host scripts.
      // 93 covers basic JS only. Complete UI also needs inert (102), :has (105),
      // dvh (108) and color-mix (111). OS API level does not establish support.
      if (!legacy && (typeof AbortController !== "function" || typeof Object.hasOwn !== "function"
        || typeof Array.prototype.at !== "function" || typeof String.prototype.replaceAll !== "function"
        || typeof Promise.allSettled !== "function")) {
        needsDiagnostics = true;
        throw new Error("Android System WebView 过旧，缺少当前界面所需的 JavaScript 能力（完整界面要求 Chromium 111 及以上能力）。请打开“WebView 兼容性自检”，复制实际提供程序及缺失能力信息，符合 legacy 要求时可选择“进入 legacy 模式”。无需清除应用数据。");
      }
      if (!legacy && (!("inert" in document.createElement("div")) || typeof CSS === "undefined"
        || !CSS.supports("selector(:has(*))") || !CSS.supports("height: 100dvh")
        || !CSS.supports("color: color-mix(in srgb, black, white)"))) {
        needsDiagnostics = true;
        throw new Error("当前 WebView 缺少完整界面所需能力（Chromium 111 及以上能力基线）。请点击“WebView 兼容性自检”，复制诊断信息；符合 legacy 要求时可选择“进入 legacy 模式”；无需清除应用数据。");
      }
      const invoke = window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke;
      if (typeof invoke !== "function") throw new Error("请在 bilikara beta Android 应用中打开此页面。");
      const result = await invoke("android_alpha_status");
      if (!result || result.schema_version !== 3 || result.stage !== "native-host-alpha" || result.backend !== "rust"
        || !Number.isSafeInteger(result.revision) || result.revision < 0
        || result.host_api_ready !== true || result.persistence_ready !== true || result.playback_ready !== true) {
        throw new Error("原生启动检查返回了不兼容的数据。");
      }
      if (result.window_controls_ready !== true) throw new Error("当前 WebView 的原生消息桥未就绪，请打开“WebView 兼容性自检”检查。这个结果不代表 Host 网络连接失败。");
      const destination = new URL(result.bootstrap_url);
      if (destination.protocol !== "http:" || destination.hostname !== "127.0.0.1"
        || !destination.port || destination.username || destination.password
        || !/^\/bootstrap\/[A-Za-z0-9_-]{43}$/.test(destination.pathname)
        || destination.search || destination.hash) {
        throw new Error("原生 Host 返回了不安全的启动地址。");
      }
      status.textContent = "Rust Host 已就绪，正在打开点歌和播放界面…";
      // The one-process Host credential is not displayed or logged. The local
      // entry document exchanges it for an HttpOnly cookie before loading shared UI.
      if (legacy) destination.searchParams.set("webviewMode", "legacy");
      window.location.replace(destination.href);
    } catch (error) {
      status.textContent = "启动检查失败：" + ((error && error.message) || String(error));
      if (!legacy && needsDiagnostics) {
        const diagnose = window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke;
        if (typeof diagnose === "function") Promise.resolve(diagnose("android_webview_diagnostics")).catch(function () {});
      }
    } finally { starting = false; }
  }
  await start(false);
})();
