package com.bilikara.app

import android.content.ActivityNotFoundException
import android.content.Intent
import android.util.Log
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.click
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.isDisplayed
import androidx.test.espresso.matcher.ViewMatchers.withText
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.webkit.WebViewCompat
import org.json.JSONObject
import org.json.JSONTokener
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

@RunWith(AndroidJUnit4::class)
class HostWebViewDiagnosticsTest {
  // Use the standard Espresso device setup (system animations off).
  @Test fun updateActionTargetsActualProviderWithoutContactingAnyStore() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val context = instrumentation.targetContext
    val provider = WebViewCompat.getCurrentWebViewPackage(context)!!
    val captured = AtomicReference<Intent>()
    val reportReady = CountDownLatch(1)
    ActivityScenario.launch<WindowTestActivity>(Intent(context, WindowTestActivity::class.java)).use { scenario ->
      lateinit var diagnostics: HostWebViewDiagnostics
      lateinit var webView: WebView
      scenario.onActivity { activity ->
        activity.externalActivity = { intent -> captured.set(intent); true }
        webView = WebView(activity)
        webView.settings.javaScriptEnabled = true
        activity.setContentView(webView)
        diagnostics = HostWebViewDiagnostics(activity)
        diagnostics.show(webView)
        // The diagnostic probe updates message geometry asynchronously. Queue a
        // renderer barrier after it before sending a real Espresso touch.
        webView.evaluateJavascript("true") { reportReady.countDown() }
      }
      try {
        assertTrue("Native diagnostic report settled", reportReady.await(5, TimeUnit.SECONDS))
        instrumentation.waitForIdleSync()
        onView(withText("WebView 自诊断")).check(matches(isDisplayed()))
        onView(withText("检查更新")).perform(click())
        assertEquals(Intent.ACTION_VIEW, captured.get()?.action)
        assertEquals(provider.packageName, captured.get()?.data?.getQueryParameter("id"))
        // No arbitrary browser URL, provider switch or package install is exposed.
        assertEquals("market", captured.get()?.data?.scheme)
        val component = HostWebViewDiagnostics.componentIntent(provider.packageName)
        assertEquals("android.settings.APPLICATION_DETAILS_SETTINGS", component.action)
        assertEquals("package:${provider.packageName}", component.data.toString())
        // Exercise the actual failure/recovery branch, not only Intent factories.
        scenario.onActivity { activity ->
          activity.externalActivity = { intent ->
            if (intent.data?.scheme == "market") throw ActivityNotFoundException("Isolated no-store fixture")
            captured.set(intent); true
          }
        }
        onView(withText("检查更新")).perform(click())
        assertEquals(component.action, captured.get()?.action)
        assertEquals(component.data, captured.get()?.data)
      } finally {
        scenario.onActivity { it.externalActivity = null; diagnostics.destroy(); webView.destroy() }
      }
    }
  }

  @Test fun diagnosticProbeRunsOnActualLoadedWebViewAndRecordsMissingCapabilities() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    ActivityScenario.launch<WindowTestActivity>(Intent(context, WindowTestActivity::class.java)).use { scenario ->
      lateinit var view: WebView
      val loaded = CountDownLatch(1)
      scenario.onActivity { activity ->
        view = WebView(activity)
        view.settings.javaScriptEnabled = true
        activity.setContentView(view)
        view.webViewClient = object : WebViewClient() {
          override fun onPageFinished(view: WebView, url: String) { loaded.countDown() }
        }
        view.loadDataWithBaseURL("http://127.0.0.1/", "<!doctype html><title>Local WebView probe</title>", "text/html", "UTF-8", null)
      }
      assertTrue(loaded.await(10, TimeUnit.SECONDS))
      val received = CountDownLatch(1)
      var report: JSONObject? = null
      scenario.onActivity {
        view.evaluateJavascript(HostWebViewDiagnostics.PROBE) { value ->
          report = JSONObject(JSONTokener(value).nextValue() as String)
          received.countDown()
        }
      }
      assertTrue(received.await(10, TimeUnit.SECONDS))
      val provider = WebViewCompat.getCurrentWebViewPackage(context)!!
      assertTrue(report!!.getString("user_agent").contains("Chrome/${provider.versionName}"))
      val missing = report!!.getJSONArray("missing")
      if (provider.versionName!!.substringBefore('.').toInt() >= HostWebViewDiagnostics.UI_CHROMIUM_BASELINE)
        assertEquals("Current complete UI capability baseline", 0, missing.length())
      else assertTrue("Historic engine must expose actual missing capabilities", missing.length() > 0)
      Log.i("BilikaraWebViewTest", JSONObject().put("package", provider.packageName)
        .put("version", provider.versionName).put("facts", report).toString())
      scenario.onActivity { view.destroy() }
    }
  }
}
