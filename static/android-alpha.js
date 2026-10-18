(async () => {
  "use strict";
  const status = document.getElementById("bootstrap-status");
  const details = document.getElementById("bootstrap-details");
  try {
    // Keep this bootstrap parseable by older WebViews so an unsupported engine
    // gets an actionable message before loading the shared modern Host scripts.
    // Chromium 93 supplies these existing frontend primitives; OS API != engine.
    if (typeof AbortController !== "function" || typeof Object.hasOwn !== "function"
      || typeof Array.prototype.at !== "function" || typeof String.prototype.replaceAll !== "function"
      || typeof Promise.allSettled !== "function") {
      throw new Error("Android System WebView 过旧，缺少当前界面所需的 JavaScript 能力（Chromium 93 及以上能力基线）。请在系统应用商店更新 Android System WebView 或系统当前使用的 Chrome/WebView 提供程序，然后重新打开 bilikara。无需清除应用数据；若仍失败，请提供 WebView 提供程序名称及完整版本号。");
    }
    const invoke = window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke;
    if (typeof invoke !== "function") throw new Error("请在 bilikara beta Android 应用中打开此页面。");
    const result = await invoke("android_alpha_status");
    if (!result || result.schema_version !== 3 || result.stage !== "native-host-alpha" || result.backend !== "rust"
      || !Number.isSafeInteger(result.revision) || result.revision < 0
      || result.host_api_ready !== true || result.persistence_ready !== true || result.playback_ready !== true) {
      throw new Error("原生启动检查返回了不兼容的数据。");
    }
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
    window.location.replace(destination.href);
  } catch (error) {
    status.textContent = "启动检查失败：" + ((error && error.message) || String(error));
  }
})();
