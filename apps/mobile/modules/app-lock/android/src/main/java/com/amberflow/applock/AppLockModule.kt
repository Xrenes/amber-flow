package com.amberflow.applock

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Wraps Android's screen-pinning (lock task) APIs so a running Tracker
// session can pin the app to the foreground, blocking home/recents/app-
// switching. Two very different strength levels share this one API surface:
//
// - Without Device Owner: startLockTask() still works (any app can call it),
//   but the user can exit any time via the "unpin" affordance (press-and-
//   hold back+recents, or swipe down twice on gesture nav) — a deterrent,
//   not a lock.
// - With Device Owner (granted out-of-band via `dpm set-device-owner` or QR
//   provisioning on a freshly factory-reset device — see the provisioning
//   runbook, this can't be granted from inside the app): the same
//   startLockTask() call becomes unexitable by the user. isDeviceOwner()
//   lets the JS side tell agents/admins which mode they're actually in
//   rather than silently assuming the strong guarantee applies.
class AppLockModule : Module() {
  private val componentName: ComponentName
    get() = ComponentName(appContext.reactContext!!, AppLockDeviceAdminReceiver::class.java)

  private val devicePolicyManager: DevicePolicyManager
    get() = appContext.reactContext!!.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

  override fun definition() = ModuleDefinition {
    Name("AppLock")

    Function("isDeviceOwner") {
      val context = appContext.reactContext ?: return@Function false
      devicePolicyManager.isDeviceOwnerApp(context.packageName)
    }

    Function("startLock") {
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      if (devicePolicyManager.isDeviceOwnerApp(activity.packageName)) {
        // Required once before the OS will honor lock-task mode for this
        // package when triggered programmatically (not user-initiated).
        devicePolicyManager.setLockTaskPackages(componentName, arrayOf(activity.packageName))
      }
      activity.startLockTask()
    }

    Function("stopLock") {
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      activity.stopLockTask()
    }
  }
}
