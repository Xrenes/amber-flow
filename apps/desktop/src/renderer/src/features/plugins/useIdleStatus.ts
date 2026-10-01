import { useEffect, useRef, useState } from 'react';
import { upsertPresence, insertActivityLog } from '@amber-flow/shared';
import type { PresenceStatus } from '@amber-flow/shared';
import { isDemoMode } from '../../demo/demoData';

const IDLE_AFTER_MS = 10_000; // no mouse/keyboard input for 10s -> idle
const AWAY_AFTER_MS = 5 * 60_000; // no input for 5 min -> away
const HEARTBEAT_MS = 2_000; // how often we re-check status, so the 10s idle threshold is caught promptly

// Watches keyboard/mouse activity and upserts this user's status into the
// shared `presence` table on an interval. Only runs while `enabled` (the
// Idle/Active Status plugin toggle) is true — visible to the agent via
// PresenceIndicator, and to admin/manager in the Admin Panel. Returns the
// locally-computed status (not a round-trip from the DB) so the agent's own
// badge updates immediately.
export function useIdleStatus(userId: string | undefined, enabled: boolean): PresenceStatus | null {
  const lastActivityRef = useRef(Date.now());
  const lastLoggedStatusRef = useRef<PresenceStatus | null>(null);
  const [status, setStatus] = useState<PresenceStatus | null>(null);

  useEffect(() => {
    if (!enabled || !userId) {
      setStatus(null);
      lastLoggedStatusRef.current = null;
      return;
    }

    function markActive() {
      lastActivityRef.current = Date.now();
    }

    const events: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, markActive, { passive: true }));

    // Presence upsert + activity log only fire on an actual transition
    // (active<->idle<->away), not every 2s heartbeat tick — otherwise a fast
    // heartbeat (needed to catch the 10s idle threshold promptly) would spam
    // the DB with identical writes every couple seconds.
    function reportStatus(next: PresenceStatus) {
      setStatus(next);
      if (isDemoMode()) return;
      if (lastLoggedStatusRef.current === next) return;
      lastLoggedStatusRef.current = next;
      upsertPresence(userId!, next).then(() => {});
      const actionType = next === 'active' ? 'STATUS_ACTIVE' : next === 'idle' ? 'STATUS_IDLE' : 'STATUS_AWAY';
      insertActivityLog(userId!, actionType, {}).catch(() => {});
    }

    const interval = window.setInterval(() => {
      const idleFor = Date.now() - lastActivityRef.current;
      const next: PresenceStatus = idleFor >= AWAY_AFTER_MS ? 'away' : idleFor >= IDLE_AFTER_MS ? 'idle' : 'active';
      reportStatus(next);
    }, HEARTBEAT_MS);

    // Report once immediately so status shows up right away, not after the
    // first heartbeat interval elapses.
    reportStatus('active');

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, markActive));
      window.clearInterval(interval);
    };
  }, [userId, enabled]);

  return status;
}
