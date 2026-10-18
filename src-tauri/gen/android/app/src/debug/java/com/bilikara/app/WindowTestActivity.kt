package com.bilikara.app

import android.os.Bundle
import android.content.Intent
import androidx.appcompat.app.AppCompatActivity

/** Instrumentation-only window, without the process-owning Rust Host. */
class WindowTestActivity : AppCompatActivity() {
  // Explicit test-only interception. Ordinary window fixtures retain OS routing.
  var externalActivity: ((Intent) -> Boolean)? = null
  override fun startActivity(intent: Intent) {
    if (externalActivity?.invoke(intent) != true) super.startActivity(intent)
  }
  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(androidx.appcompat.R.style.Theme_AppCompat_Light_NoActionBar)
    super.onCreate(savedInstanceState)
  }
}
