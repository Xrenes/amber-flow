import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mobile port of the desktop useWorldClocks — same storage key/shape/default
// list, but AsyncStorage is async-only, so clocks start as the default list
// and are replaced once the stored list loads (matches the pattern used for
// the tracker's goal/live-state persistence).
const CLOCKS_KEY = 'amber.clocks.v2';

const DEFAULT_CLOCKS = [
  'America/Los_Angeles', // PST/PDT
  'America/Denver', // MST/MDT
  'America/Chicago', // CST/CDT
  'America/New_York', // EST/EDT
];

export function useWorldClocks() {
  const [clocks, setClocks] = useState<string[]>(DEFAULT_CLOCKS);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    AsyncStorage.getItem(CLOCKS_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) setClocks(parsed);
      } catch {
        /* noop */
      }
    });
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const addClock = useCallback((tz: string) => {
    setClocks((prev) => {
      if (prev.includes(tz)) return prev;
      const next = [...prev, tz];
      AsyncStorage.setItem(CLOCKS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const removeClock = useCallback((idx: number) => {
    setClocks((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      AsyncStorage.setItem(CLOCKS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return { clocks, now, addClock, removeClock };
}
