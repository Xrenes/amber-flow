import { useEffect, useMemo, useState } from 'react';
import {
  listAgentGoals,
  subscribeToAgentGoals,
  computeAgentAttainmentRow,
  periodRange,
  getSupabase,
} from '@amber-flow/shared';
import type { AgentGoal, Profile, Appointment, TimeSession, AgentAttainmentRow, PeriodKey } from '@amber-flow/shared';
import { isDemoMode } from '../../demo/demoData';
import type { AdminData } from './useAdminData';

export type { AgentAttainmentRow, PeriodKey };

// Matches the seeded global default row from migrations/013_agent_goals.sql
// (3 appointments / 2 shows per day) — used in demo mode instead of a real
// Supabase query, same pattern as usePlugins' demoPlugins fallback.
const DEMO_GOALS: AgentGoal[] = [
  { id: 'demo-global', user_id: null, campaign_name: null, daily_appointment_goal: 3, daily_show_goal: 2 },
];

// Team-wide wrapper around the shared computeAgentAttainmentRow (see
// packages/shared/src/goalAttainment.ts for the calculation itself and the
// period-window definitions, confirmed against the DialForce sheet
// screenshots) — one row per agent profile, built from data useAdminData
// already fetches. The agent-facing "My Reports" Goals tab computes its own
// single row with the same shared function directly, so the numbers a
// manager sees here for an agent always match what that agent sees for
// themselves.
function computeRows(
  profiles: Profile[],
  appointments: Appointment[],
  sessions: TimeSession[],
  goals: AgentGoal[],
  range: { start: Date; end: Date }
): AgentAttainmentRow[] {
  return profiles
    .filter((p) => p.role === 'agent')
    .map((p) => computeAgentAttainmentRow(p.id, p.name || 'Unknown', appointments, sessions, goals, range));
}

export function useGoalAttainment(data: AdminData, reportDate: Date) {
  const [goals, setGoals] = useState<AgentGoal[]>(isDemoMode() ? DEMO_GOALS : []);
  const [loading, setLoading] = useState(!isDemoMode());

  useEffect(() => {
    if (isDemoMode()) {
      setGoals(DEMO_GOALS);
      setLoading(false);
      return;
    }

    let cancelled = false;
    function refresh() {
      listAgentGoals().then(({ data: rows }) => {
        if (cancelled) return;
        if (rows) setGoals(rows as AgentGoal[]);
        setLoading(false);
      });
    }
    refresh();
    const channel = subscribeToAgentGoals(refresh);
    return () => {
      cancelled = true;
      getSupabase().removeChannel(channel);
    };
  }, []);

  const weekRows = useMemo(
    () => computeRows(data.profiles, data.appointments, data.sessions, goals, periodRange('week', reportDate)),
    [data.profiles, data.appointments, data.sessions, goals, reportDate]
  );
  const monthRows = useMemo(
    () => computeRows(data.profiles, data.appointments, data.sessions, goals, periodRange('month', reportDate)),
    [data.profiles, data.appointments, data.sessions, goals, reportDate]
  );
  const quarterRows = useMemo(
    () => computeRows(data.profiles, data.appointments, data.sessions, goals, periodRange('quarter', reportDate)),
    [data.profiles, data.appointments, data.sessions, goals, reportDate]
  );

  return { goals, loading, weekRows, monthRows, quarterRows };
}
