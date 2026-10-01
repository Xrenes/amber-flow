import { useEffect, useRef } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { insertActivityLog } from '@amber-flow/shared';
import { addScreenStateListener, isScreenOn, isScreenActivitySupported } from '../../../modules/screen-activity';

// Logs how much of a tracked work session the agent's phone screen was on
// (Android) or the app was backgrounded (iOS). `enabled` is the caller's
// combined gate — both the admin/manager Plugin Store toggle ('screen-
// activity', same registry as desktop's Idle/Active Status plugin) AND
// whether a Tracker session is actively running — so nothing is logged
// unless both are true. Mirrors the desktop idle-status hook's "log only on
// transitions" pattern so it doesn't spam activity_logs. Two very different
// platform signals feed the same log shape, distinguished by action type:
//
// - Android: ACTION_SCREEN_ON/OFF system broadcasts (no permission needed).
//   These reflect the physical display, independent of which app is in the
//   foreground, so "screen off" reliably means the phone is dark/idle.
// - iOS: Apple blocks screen-on/off and lock-state detection from all
//   third-party apps unconditionally (MDM or not). AppState's
//   active/background transition — did the agent leave the Amber Flow app —
//   is the closest available substitute, but it CANNOT distinguish "phone
//   locked on the desk" from "phone unlocked and being used in another app."
//   It's a rough signal only, by explicit agreement.
export function useScreenActivity(userId: string | undefined, enabled: boolean) {
  const lastStateRef = useRef<'on' | 'off' | null>(null);

  useEffect(() => {
    if (!enabled || !userId) {
      lastStateRef.current = null;
      return;
    }

    function report(next: 'on' | 'off') {
      if (lastStateRef.current === next) return;
      lastStateRef.current = next;
      const actionType =
        Platform.OS === 'android'
          ? next === 'on'
            ? 'SCREEN_ON'
            : 'SCREEN_OFF'
          : next === 'on'
            ? 'APP_FOREGROUND'
            : 'APP_BACKGROUND';
      insertActivityLog(userId!, actionType, {}).catch(() => {});
    }

    if (Platform.OS === 'android') {
      // In Expo Go the native module isn't present — stay fully inert
      // (no log spam) rather than silently reporting a fake "on" state.
      if (!isScreenActivitySupported()) return;
      report(isScreenOn() ? 'on' : 'off');
      const sub = addScreenStateListener((e) => report(e.isScreenOn ? 'on' : 'off'));
      return () => {
        sub?.remove();
        lastStateRef.current = null;
      };
    }

    // iOS fallback: AppState only tells us foreground/background for OUR
    // app, not the device screen — see the rough-signal caveat above.
    report(AppState.currentState === 'active' ? 'on' : 'off');
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      report(state === 'active' ? 'on' : 'off');
    });
    return () => {
      sub.remove();
      lastStateRef.current = null;
    };
  }, [userId, enabled]);
}
