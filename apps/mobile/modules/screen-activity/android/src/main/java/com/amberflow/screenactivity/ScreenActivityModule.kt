package com.amberflow.screenactivity

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.PowerManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Listens for the system-wide ACTION_SCREEN_ON / ACTION_SCREEN_OFF broadcasts.
// These require no special permission — any app can register for them — and
// they fire whenever the physical display turns on or off, regardless of
// which app is in the foreground. That makes them a good proxy for "is the
// agent's phone screen currently lit up," independent of whether Amber Flow
// itself is the active app. iOS has no equivalent API for third-party apps,
// so this module is Android-only; the JS side falls back to AppState there.
class ScreenActivityModule : Module() {
  private var receiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("ScreenActivity")

    Events("onScreenStateChange")

    Function("isScreenOn") {
      val pm = appContext.reactContext?.getSystemService(Context.POWER_SERVICE) as? PowerManager
      pm?.isInteractive ?: true
    }

    OnCreate {
      val context = appContext.reactContext ?: return@OnCreate
      val filter = IntentFilter().apply {
        addAction(Intent.ACTION_SCREEN_ON)
        addAction(Intent.ACTION_SCREEN_OFF)
      }
      val r = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
          val isOn = intent?.action == Intent.ACTION_SCREEN_ON
          sendEvent(
            "onScreenStateChange",
            mapOf(
              "isScreenOn" to isOn,
              "timestamp" to System.currentTimeMillis()
            )
          )
        }
      }
      receiver = r
      context.registerReceiver(r, filter)
    }

    OnDestroy {
      val r = receiver ?: return@OnDestroy
      try {
        appContext.reactContext?.unregisterReceiver(r)
      } catch (_: IllegalArgumentException) {
        // Already unregistered — safe to ignore.
      }
      receiver = null
    }
  }
}
