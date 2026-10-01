import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Same storage key/shape as the desktop useSettings, but AsyncStorage is
// async-only so settings start empty and are replaced once the stored value
// loads. This lives in a single Context (not a per-screen hook) because
// MainTabs keeps every tab mounted simultaneously — a per-screen useState
// hook would mean Settings saving a new value never reaches the already-
// mounted Tasks/Appointments screens until the whole app restarts. Skips
// browserNotif (not a mobile concept) and custom-audio-file-upload fields —
// mobile push notifications will be a separate feature.
const SETTINGS_KEY = 'amber.settings.v1';

export interface AmberSettings {
  displayName?: string;
  defaultReminderMins?: number;
  soundEnabled?: boolean;
  alarmTone?: 'default' | 'gentle' | 'urgent';
  alarmVolume?: number;
}

interface SettingsContextValue {
  settings: AmberSettings;
  update: (patch: Partial<AmberSettings>) => void;
  loaded: boolean;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AmberSettings>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY)
      .then((raw) => {
        if (raw) setSettings(JSON.parse(raw));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const update = useCallback((patch: Partial<AmberSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return <SettingsContext.Provider value={{ settings, update, loaded }}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
