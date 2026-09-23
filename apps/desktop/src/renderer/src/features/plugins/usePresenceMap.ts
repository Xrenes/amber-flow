import { useEffect, useState } from 'react';
import { listPresence, subscribeToPresence, getSupabase } from '@amber-flow/shared';
import type { Presence, PresenceStatus } from '@amber-flow/shared';

const STALE_AFTER_MS = 2 * 60_000; // no heartbeat in 2 min -> treat as away

// Live map of user_id -> presence status for the Admin Panel's Overview tab.
export function usePresenceMap() {
  const [map, setMap] = useState<Record<string, Presence>>({});

  useEffect(() => {
    async function refresh() {
      const { data } = await listPresence();
      if (!data) return;
      const next: Record<string, Presence> = {};
      data.forEach((p) => {
        next[p.user_id] = p;
      });
      setMap(next);
    }
    refresh();
    const channel = subscribeToPresence(refresh);
    return () => {
      getSupabase().removeChannel(channel);
    };
  }, []);

  function statusFor(userId: string): PresenceStatus | null {
    const p = map[userId];
    if (!p) return null;
    if (Date.now() - new Date(p.last_active).getTime() > STALE_AFTER_MS) return 'away';
    return p.status;
  }

  return { statusFor };
}
