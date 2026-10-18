package com.bilikara.app

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.webkit.WebView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import org.json.JSONTokener

/** Device I/O, available even when the shared frontend cannot parse or start. */
internal class HostWebViewDiagnostics(private val activity: AppCompatActivity) {
  companion object {
    // Full Android UI requirement, not merely the JavaScript startup floor (93).
    const val UI_CHROMIUM_BASELINE = 111

    // ES5 syntax deliberately: diagnostics must execute on an unsupported engine.
    internal val PROBE = """
      (function () {
        var missing = [];
        function need(name, available) { if (!available) missing.push(name); }
        need('AbortController', typeof AbortController === 'function');
        need('Object.hasOwn', typeof Object.hasOwn === 'function');
        need('Array.at', typeof Array.prototype.at === 'function');
        need('String.replaceAll', typeof String.prototype.replaceAll === 'function');
        need('Promise.allSettled', typeof Promise.allSettled === 'function');
        need('HTMLElement.inert', 'inert' in document.createElement('div'));
        function css(rule) { try { return typeof CSS !== 'undefined' && CSS.supports(rule); } catch (e) { return false; } }
        need('CSS :has()', css('selector(:has(*))'));
        need('CSS dvh', css('height: 100dvh'));
        need('CSS color-mix()', css('color: color-mix(in srgb, black, white)'));
        return JSON.stringify({missing: missing, user_agent: navigator.userAgent,
          document_origin: typeof location === 'object' ? location.origin : '',
          secure_context: window.isSecureContext === true,
          web_rtc: typeof RTCPeerConnection === 'function',
          web_audio: typeof AudioContext === 'function',
          audio_worklet: typeof AudioWorkletNode === 'function',
          web_assembly: typeof WebAssembly === 'object'});
      })()
    """.trimIndent()

    internal fun updateIntent(providerPackage: String) = Intent(Intent.ACTION_VIEW,
      Uri.parse("market://details").buildUpon().appendQueryParameter("id", providerPackage).build())

    internal fun componentIntent(providerPackage: String) = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
      Uri.fromParts("package", providerPackage, null))
  }

  private var dialog: AlertDialog? = null
  private var report = ""

  fun checkOnCreate(webView: WebView) {
    val provider = WebViewCompat.getCurrentWebViewPackage(activity)
    val major = provider?.versionName?.substringBefore('.')?.toIntOrNull()
    if (provider == null || (major != null && major < UI_CHROMIUM_BASELINE) ||
      !WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
      webView.post { if (!activity.isFinishing && !activity.isDestroyed) show(webView) }
    }
  }

  fun show(webView: WebView) {
    if (dialog?.isShowing == true || activity.isFinishing || activity.isDestroyed) return
    val provider = WebViewCompat.getCurrentWebViewPackage(activity)
    val bridge = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
    val summary = "完整界面需要 Chromium $UI_CHROMIUM_BASELINE 及以上能力，并支持原生消息桥。" +
      "请更新当前实际使用的组件，再重新打开 bilikara。无需清除应用数据。"
    val base = "Android ${Build.VERSION.RELEASE} / API ${Build.VERSION.SDK_INT}\n" +
      "WebView: ${provider?.packageName ?: "未识别"}\n版本: ${provider?.versionName ?: "未知"}\n" +
      "原生消息桥: ${if (bridge) "支持" else "不支持"}"
    report = "$base\n网页能力: 检测中"
    val current = AlertDialog.Builder(activity).setTitle("WebView 自诊断")
      .setMessage("$summary\n\n$report")
      .setPositiveButton("检查更新", null)
      .setNeutralButton("复制诊断", null)
      .setNegativeButton("关闭", null).create()
    dialog = current
    current.setOnDismissListener { if (dialog === current) dialog = null }
    current.show()
    current.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
      if (provider == null) {
        Toast.makeText(activity, "未识别当前组件，请通过系统设置检查 WebView 或系统更新", Toast.LENGTH_LONG).show()
      } else openUpdate(provider.packageName)
    }
    current.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener {
      val clipboard = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      clipboard.setPrimaryClip(ClipData.newPlainText("bilikara WebView", report))
      Toast.makeText(activity, "WebView 诊断信息已复制", Toast.LENGTH_SHORT).show()
    }
    webView.evaluateJavascript(PROBE) { value ->
      if (dialog !== current || !current.isShowing || activity.isDestroyed) return@evaluateJavascript
      val facts = try { JSONObject(JSONTokener(value).nextValue() as String) } catch (_: Exception) { null }
      val missing = facts?.optJSONArray("missing")
      val check = when {
        missing == null -> "网页能力: 未能完成检测；当前结果不代表兼容性通过"
        missing.length() == 0 -> "网页基础能力: 通过（不代表播放、网络及所有设备功能已验收）"
        else -> "缺少能力: " + (0 until missing.length()).joinToString("、") { missing.getString(it) }
      }
      report = "$base\n$check" + if (facts == null) "" else
        "\n检测页: ${facts.optString("document_origin")}\n检测页安全上下文: ${facts.optBoolean("secure_context")}\nWebRTC: ${facts.optBoolean("web_rtc")}" +
        " / WebAudio: ${facts.optBoolean("web_audio")} / AudioWorklet: ${facts.optBoolean("audio_worklet")}" +
        " / WASM: ${facts.optBoolean("web_assembly")}\nUA: ${facts.optString("user_agent") }"
      current.setMessage("$summary\n\n$report")
    }
  }

  private fun openUpdate(providerPackage: String) {
    try {
      activity.startActivity(updateIntent(providerPackage))
    } catch (_: ActivityNotFoundException) {
      openComponent(providerPackage)
    } catch (_: SecurityException) {
      openComponent(providerPackage)
    }
  }

  private fun openComponent(providerPackage: String) {
    try {
      activity.startActivity(componentIntent(providerPackage))
      Toast.makeText(activity, "未找到可用商店，已打开组件信息；也可通过系统更新检查新版", Toast.LENGTH_LONG).show()
    } catch (_: ActivityNotFoundException) {
      Toast.makeText(activity, "无法打开组件信息，请在系统设置中检查该组件或系统更新", Toast.LENGTH_LONG).show()
    } catch (_: SecurityException) {
      Toast.makeText(activity, "系统限制了组件信息入口，请手动打开系统设置", Toast.LENGTH_LONG).show()
    }
  }

  fun destroy() { dialog?.dismiss(); dialog = null }
}
