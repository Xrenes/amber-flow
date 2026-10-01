import { useEffect, useState } from 'react';
import { AppState, DeviceEventEmitter } from 'react-native';
import { listTeamDirectory } from '@amber-flow/shared';

export interface TeamMember {
  id: string;
  name: string;
}

// Fired after the signed-in user renames themselves in Settings, so every
// open Agent dropdown picks up the new name right away (tabs stay mounted).
export const PROFILES_CHANGED_EVENT = 'amber:profiles-changed';

export function notifyProfilesChanged() {
  DeviceEventEmitter.emit(PROFILES_CHANGED_EVENT);
}

// Loads every teammate's id/name, used to populate Agent dropdowns. A
// person's display name IS their agent name, so this reloads after a rename
// and whenever the app returns to the foreground (teammates' renames).
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
    const renameSub = DeviceEventEmitter.addListener(PROFILES_CHANGED_EVENT, load);
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });
    return () => {
      cancelled = true;
      renameSub.remove();
      appSub.remove();
    };
  }, []);

  return { members, loading };
}
