import { useEffect, useState } from 'react';
import { listTeamDirectory } from '@amber-flow/shared';

export interface TeamMember {
  id: string;
  name: string;
}

// Fired after the signed-in user renames themselves in Settings, so every
// open Agent dropdown / Admin list picks up the new name right away.
export const PROFILES_CHANGED_EVENT = 'amber:profiles-changed';

export function notifyProfilesChanged() {
  window.dispatchEvent(new Event(PROFILES_CHANGED_EVENT));
}

// Loads every teammate's id/name (any signed-in user can read this — see
// migrations/008_*.sql), used to populate Agent dropdowns. A person's
// display name IS their agent name, so this reloads after a rename in this
// window and whenever the window regains focus (to catch teammates' renames).
export function useTeamDirectory() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    function load() {
      listTeamDirectory().then(({ data }) => {
        if (cancelled) return;
        if (data) setMembers(data as TeamMember[]);
        setLoading(false);
      });
    }
    load();
    window.addEventListener(PROFILES_CHANGED_EVENT, load);
    window.addEventListener('focus', load);
    return () => {
      cancelled = true;
      window.removeEventListener(PROFILES_CHANGED_EVENT, load);
      window.removeEventListener('focus', load);
    };
  }, []);

  return { members, loading };
}
