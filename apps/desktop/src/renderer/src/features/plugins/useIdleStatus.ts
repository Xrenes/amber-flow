import { useEffect, useRef, useState } from 'react';
import { upsertPresence } from '@amber-flow/shared';
import type { PresenceStatus } from '@amber-flow/shared';
import { isDemoMode } from '../../demo/demoData';

const IDLE_AFTER_MS = 5 * 60_000; // no input for 5 min -> idle
const AWAY_AFTER_MS = 15 * 60_000; // no input for 15 min -> away
const HEARTBEAT_MS = 30_000; // how often we re-check/report status

// Watches keyboard/mouse activity and upserts this user's status into the
// shared `presence` table on an interval. Only runs while `enabled` (the
// Idle/Active Status plugin toggle) is true — visible to the agent via
// PresenceIndicator, and to admin/manager in the Admin Panel. Returns the
// locally-computed status (not a round-trip from the DB) so the agent's own
// badge updates immediately.
export function useIdleStatus(userId: string | undefined, enabled: boolean): PresenceStatus | null {
  const lastActivityRef = useRef(Date.now());
  const [status, setStatus] = useState<PresenceStatus | null>(null);

  useEffect(() => {
    if (!enabled || !userId) {
      setStatus(null);
      return;
    }

    function markActive() {
      lastActivityRef.current = Date.now();
    }

    const events: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, markActive, { passive: true }));

    const interval = window.setInterval(() => {
      const idleFor = Date.now() - lastActivityRef.current;
      const next: PresenceStatus = idleFor >= AWAY_AFTER_MS ? 'away' : idleFor >= IDLE_AFTER_MS ? 'idle' : 'active';
      setStatus(next);
      if (!isDemoMode()) upsertPresence(userId, next).then(() => {});
    }, HEARTBEAT_MS);

    // Report once immediately so status shows up right away, not after the
    // first heartbeat interval elapses.
    setStatus('active');
    if (!isDemoMode()) upsertPresence(userId, 'active').then(() => {});

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, markActive));
      window.clearInterval(interval);
    };
  }, [userId, enabled]);

  return status;
}
