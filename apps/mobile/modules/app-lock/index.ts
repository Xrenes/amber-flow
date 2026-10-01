import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

interface AppLockNativeModule {
  isDeviceOwner(): boolean;
  startLock(): void;
  stopLock(): void;
}

// Android-only (see expo-module.config.json — no ios entry). iOS has no
// unattended equivalent: the only API that can pin a single app (Guided
// Access) requires a human to manually triple-click the side button on that
// specific device, and cannot be triggered or enforced by an app, MDM or
// not, on a non-supervised device. Wrapped in try/catch — requireNativeModule
// throws when the native binary isn't present, which includes Expo Go (it
// only ships Expo's own SDK modules, not custom local ones like this).
let NativeAppLock: AppLockNativeModule | null = null;
if (Platform.OS === 'android') {
  try {
    NativeAppLock = requireNativeModule<AppLockNativeModule>('AppLock');
  } catch {
    NativeAppLock = null;
  }
}

// True only if this device was enrolled as Device Owner out-of-band (QR
// provisioning on a freshly factory-reset device, or `adb shell dpm
// set-device-owner`) — see the provisioning runbook. Determines whether
// startLock() below is a real, user-unexitable lock or just a soft deterrent.
export function isDeviceOwner(): boolean {
  return NativeAppLock ? NativeAppLock.isDeviceOwner() : false;
}

export function isAppLockSupported(): boolean {
  return Platform.OS === 'android';
}

// Pins the app to the foreground (Android screen-pinning / lock task mode).
// Strength depends on isDeviceOwner() — see module doc comment above.
export function startLock(): void {
  NativeAppLock?.startLock();
}

export function stopLock(): void {
  NativeAppLock?.stopLock();
}
