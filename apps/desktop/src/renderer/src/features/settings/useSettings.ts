import { useCallback, useState } from 'react';
import type { AlarmTone } from '../alarm/alarmTones';

// Ports loadSettings/saveSettings from app.js exactly, same localStorage key
// ('amber.settings.v1') and same loose/partial shape (settings object grows
// over time; unknown fields are preserved via spread on save).
const SETTINGS_KEY = 'amber.settings.v1';

export interface AmberSettings {
  displayName?: string;
  defaultReminderMins?: number;
  soundEnabled?: boolean;
  browserNotif?: boolean;
  alarmTone?: AlarmTone;
  alarmVolume?: number;
  customToneName?: string;
}

export function loadSettings(): AmberSettings {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveSettings(s: AmberSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

// isSoundEnabled(): default is "on" unless explicitly set to false.
export function isSoundEnabled(): boolean {
  return loadSettings().soundEnabled !== false;
}

export function useSettings() {
  const [settings, setSettings] = useState<AmberSettings>(() => loadSettings());

  const update = useCallback((patch: Partial<AmberSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  return { settings, update, reload: () => setSettings(loadSettings()) };
}
