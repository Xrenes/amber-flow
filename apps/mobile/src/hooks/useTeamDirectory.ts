import { useEffect, useState } from 'react';
import { listTeamDirectory } from '@amber-flow/shared';

export interface TeamMember {
  id: string;
  name: string;
}

// Loads every teammate's id/name (any signed-in user can read this — see
// migrations/008_*.sql), used to populate the Appointment modal's Agent
// dropdown so an appointment can be assigned to self or handed off to
// another agent.
export function useTeamDirectory() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listTeamDirectory().then(({ data }) => {
      if (cancelled) return;
      setMembers((data as TeamMember[]) || []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { members, loading };
}
