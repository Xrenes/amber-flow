import { useCallback, useEffect, useRef, useState } from 'react';
import { ensureAudioContext, playAlarmTone, type AlarmTone } from './alarmTones';

// Ports app.js's alarm system (lines ~497-653): the Web Audio beep/tone
// generator, the custom-audio-file loop, browser Notification permission +
// showSystemNotification, and trigger/dismiss/snooze. The scheduler that
// decides WHEN to call trigger() (scanning appointments for due items)
// is NOT here — that belongs to MainPage per the task brief. This hook only
// exposes the reusable alarm primitives.

export type AlarmKind = 'appointment';
export type AlarmLabelKind = 'due' | 'reminder';

// Minimal shape an Appointment satisfies for alarm display purposes.
export interface AlarmItem {
  id: string;
  title: string;
  description?: string | null;
  // Pre-formatted display string for the alarm screen's time line (caller
  // formats this from date/time or scheduled_time + timezone, since task and
  // appointment date fields differ in shape).
  displayTime?: string;
}

export interface AlarmState {
  item: AlarmItem;
  kind: AlarmKind;
  labelKind: AlarmLabelKind;
}

// Settings read from the same localStorage key app.js's Settings modal uses
// (amber.settings.v1), so alarm tone/volume/sound-enabled stay in sync with
// whatever the Settings feature writes there.
const SETTINGS_KEY = 'amber.settings.v1';

interface AlarmSettings {
  soundEnabled?: boolean;
  alarmTone?: AlarmTone;
  alarmVolume?: number;
  browserNotif?: boolean;
  customToneName?: string;
}

function loadSettings(): AlarmSettings {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    return {};
  }
}

// --- Notification permission (auto-request on load, ported verbatim) -----
if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

function showSystemNotification(item: AlarmItem, label: string) {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(`${label}: ${item.title}`, {
      body: item.description || item.displayTime || '',
      tag: `amber-${item.id}`,
      requireInteraction: true,
      icon: new URL('../../assets/logo.png', import.meta.url).href,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* noop */
  }
}

export interface UseAlarmResult {
  alarm: AlarmState | null;
  trigger: (item: AlarmItem, kind: AlarmKind, labelKind?: AlarmLabelKind) => void;
  dismiss: () => void;
  snooze: (onSnooze?: (item: AlarmItem, kind: AlarmKind) => void, snoozeMs?: number) => void;
}

export function useAlarm(): UseAlarmResult {
  const [alarm, setAlarm] = useState<AlarmState | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const alarmIntervalRef = useRef<number | null>(null);
  const customAudioRef = useRef<HTMLAudioElement | null>(null);
  const customAudioUrlRef = useRef<string | null>(null);

  // --- ensureAudioCtx (shared with the Settings preview — alarmTones.ts) ---
  const ensureAudioCtx = useCallback((): AudioContext | null => ensureAudioContext(audioCtxRef), []);

  // Prime the audio context on first user gesture (browsers require it).
  useEffect(() => {
    const handler = () => ensureAudioCtx();
    document.addEventListener('click', handler, { once: true });
    return () => document.removeEventListener('click', handler);
  }, [ensureAudioCtx]);

  // --- beep: the real alarm's tone, via the shared generator (alarmTones.ts)
  // so it's always exactly what Settings' Preview button plays. ---
  const beep = useCallback(
    (toneOverride?: AlarmTone, volOverride?: number) => {
      const ctx = ensureAudioCtx();
      if (!ctx) return;
      const s = loadSettings();
      const tone = toneOverride || s.alarmTone || 'default';
      const vol = (volOverride !== undefined ? volOverride : s.alarmVolume ?? 100) / 100;
      playAlarmTone(ctx, tone, vol);
    },
    [ensureAudioCtx]
  );

  // --- playCustomTone / stopCustomTone (ported) ---
  const playCustomTone = useCallback((vol?: number): boolean => {
    if (!customAudioUrlRef.current) return false;
    if (!customAudioRef.current) customAudioRef.current = new Audio();
    const el = customAudioRef.current;
    el.src = customAudioUrlRef.current;
    el.volume = Math.min(1, Math.max(0, (vol ?? 80) / 100));
    el.currentTime = 0;
    el.play().catch(() => {});
    return true;
  }, []);

  const stopCustomTone = useCallback(() => {
    if (customAudioRef.current) {
      customAudioRef.current.pause();
      customAudioRef.current.currentTime = 0;
    }
  }, []);

  // --- startAlarmSound / stopAlarmSound (ported) ---
  const stopAlarmSound = useCallback(() => {
    if (alarmIntervalRef.current !== null) {
      window.clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    stopCustomTone();
  }, [stopCustomTone]);

  const startAlarmSound = useCallback(() => {
    if (loadSettings().soundEnabled === false) return;
    stopAlarmSound();
    const s = loadSettings();
    if (s.alarmTone === 'custom') {
      if (!playCustomTone(s.alarmVolume)) {
        beep();
      } else if (customAudioRef.current) {
        customAudioRef.current.loop = true;
        customAudioRef.current.play().catch(() => {});
      }
    } else {
      beep();
      alarmIntervalRef.current = window.setInterval(() => beep(), 600);
    }
  }, [beep, playCustomTone, stopAlarmSound]);

  // --- trigger / dismiss / snooze (ported) ---
  const trigger = useCallback(
    (item: AlarmItem, kind: AlarmKind, labelKind: AlarmLabelKind = 'due') => {
      setAlarm({ item, kind, labelKind });
      startAlarmSound();
      showSystemNotification(item, labelKind === 'reminder' ? 'Reminder' : 'Appointment due');
      if (document.title.indexOf('⏰') === -1) {
        document.title = '⏰ ' + document.title;
      }
      // Pull the app window to the foreground even if minimized/backgrounded —
      // a capability a browser tab never had, so this is desktop-only (no-op
      // if the preload bridge isn't present, e.g. running as a plain web page).
      window.amberDesktop?.focusWindow?.();
    },
    [startAlarmSound]
  );

  const dismiss = useCallback(() => {
    stopAlarmSound();
    setAlarm(null);
    document.title = document.title.replace(/^⏰\s*/, '');
  }, [stopAlarmSound]);

  const snooze = useCallback(
    (onSnooze?: (item: AlarmItem, kind: AlarmKind) => void, snoozeMs = 5 * 60_000) => {
      if (alarm) {
        onSnooze?.(alarm.item, alarm.kind);
        void snoozeMs; // caller decides how to re-arm using this duration; kept for parity with app.js's 5-min snooze
      }
      dismiss();
    },
    [alarm, dismiss]
  );

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stopAlarmSound();
      if (customAudioUrlRef.current) URL.revokeObjectURL(customAudioUrlRef.current);
    };
  }, [stopAlarmSound]);

  return { alarm, trigger, dismiss, snooze };
}
