import { useCallback, useEffect, useState } from 'react';

// Ports loadClocks/saveClocks from app.js exactly, including the same
// localStorage key ('amber.clocks.v2') and the same default clock list.
const CLOCKS_KEY = 'amber.clocks.v2';

const DEFAULT_CLOCKS = [
  'America/Los_Angeles', // PST/PDT
  'America/Denver', // MST/MDT
  'America/Chicago', // CST/CDT
  'America/New_York', // EST/EDT
];

function loadClocks(): string[] {
  try {
    const raw = localStorage.getItem(CLOCKS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    /* noop */
  }
  return DEFAULT_CLOCKS;
}

function persistClocks(list: string[]) {
  localStorage.setItem(CLOCKS_KEY, JSON.stringify(list));
}

export function useWorldClocks() {
  const [clocks, setClocks] = useState<string[]>(() => loadClocks());
  const [now, setNow] = useState(() => new Date());

  // updateClockTimes() ran on a 1s interval in app.js.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const addClock = useCallback((tz: string) => {
    setClocks((prev) => {
      if (prev.includes(tz)) return prev;
      const next = [...prev, tz];
      persistClocks(next);
      return next;
    });
  }, []);

  const removeClock = useCallback((idx: number) => {
    setClocks((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      persistClocks(next);
      return next;
    });
  }, []);

  return { clocks, now, addClock, removeClock };
}
