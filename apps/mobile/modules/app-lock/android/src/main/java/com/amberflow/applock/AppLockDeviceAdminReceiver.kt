package com.amberflow.applock

import android.app.admin.DeviceAdminReceiver

// Empty on purpose — this class only needs to exist so the manifest can
// point <meta-data android.app.device_admin> at it. Being *a* device admin
// is the prerequisite for becoming Device Owner (set separately via `adb
// shell dpm set-device-owner` or QR provisioning at factory-reset setup —
// see the provisioning runbook). No custom admin behavior is needed beyond
// that; AppLockModule does the actual lock-task work once Device Owner is
// granted.
class AppLockDeviceAdminReceiver : DeviceAdminReceiver()
