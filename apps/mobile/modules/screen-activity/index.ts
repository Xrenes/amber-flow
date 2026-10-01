import { Platform } from 'react-native';
import { requireNativeModule, EventEmitter, type EventSubscription } from 'expo-modules-core';

export interface ScreenStateEvent {
  isScreenOn: boolean;
  timestamp: number;
}

type ScreenActivityEvents = {
  onScreenStateChange: (event: ScreenStateEvent) => void;
};

abstract class ScreenActivityNativeModule extends EventEmitter<ScreenActivityEvents> {
  abstract isScreenOn(): boolean;
}

// Android-only native module (see expo-module.config.json — no ios entry).
// requireNativeModule() throws if the native binary isn't present — true on
// iOS, but ALSO true in Expo Go on Android, since Expo Go only ships Expo's
// own SDK modules, not custom local ones like this. Wrapped in try/catch so
// the whole app doesn't crash on import when running in Expo Go during UI
// development; callers get isScreenOn()===true (fail open, not tracked) and
// addScreenStateListener()===null until a real EAS/dev-client build exists.
let NativeScreenActivity: ScreenActivityNativeModule | null = null;
if (Platform.OS === 'android') {
  try {
    NativeScreenActivity = requireNativeModule<ScreenActivityNativeModule>('ScreenActivity');
  } catch {
    NativeScreenActivity = null;
  }
}

// False in Expo Go (this local native module isn't part of its prebuilt
// binary) and on iOS (no ios entry — see expo-module.config.json). True only
// in a real EAS/dev-client build on Android. Callers should check this
// before relying on isScreenOn()/addScreenStateListener().
export function isScreenActivitySupported(): boolean {
  return NativeScreenActivity !== null;
}

export function isScreenOn(): boolean {
  return NativeScreenActivity ? NativeScreenActivity.isScreenOn() : true;
}

export function addScreenStateListener(listener: (event: ScreenStateEvent) => void): EventSubscription | null {
  return NativeScreenActivity ? NativeScreenActivity.addListener('onScreenStateChange', listener) : null;
}
