import { useEffect, useMemo, useState } from 'react';
import {
  listAgentGoals,
  subscribeToAgentGoals,
  agentNamesForGoals,
  computeAgentNameAttainmentRow,
  periodRange,
  getSupabase,
} from '@amber-flow/shared';
import type { AgentGoal, Profile, Appointment, TimeSession, AgentAttainmentRow, PeriodKey } from '@amber-flow/shared';
import { isDemoMode } from '../../demo/demoData';
import { useTaskFieldOptions } from '../appointments/useTaskFieldOptions';
import type { AdminData } from './useAdminData';

export type { AgentAttainmentRow, PeriodKey };

// Matches the seeded global default row from migrations/013_agent_goals.sql
// (3 appointments / 2 shows per day) — used in demo mode instead of a real
// Supabase query, same pattern as usePlugins' demoPlugins fallback.
const DEMO_GOALS: AgentGoal[] = [
  { id: 'demo-global', user_id: null, agent_name: null, campaign_name: null, daily_appointment_goal: 3, daily_show_goal: 2 },
];

// Team-wide wrapper around the shared computeAgentNameAttainmentRow (see
// packages/shared/src/goalAttainment.ts for the calculation itself and the
// period-window definitions, confirmed against the DialForce sheet
// screenshots) — one row per agent NAME (the Field Options Agent list plus
// anyone appointments/sessions are attributed to), the same attribution
// Reports uses, built from data useAdminData already fetches. My Reports'
// Goals tab uses the same function, so the numbers match for every login.
function computeRows(
  agentNames: string[],
  profiles: Profile[],
  appointments: Appointment[],
  sessions: TimeSession[],
  goals: AgentGoal[],
  range: { start: Date; end: Date }
): AgentAttainmentRow[] {
  const profileNames = Object.fromEntries(profiles.map((p) => [p.id, p.name || '']));
  return agentNames.map((name) => {
    const login = profiles.find((p) => (p.name || '').trim().toLowerCase() === name.toLowerCase());
    return computeAgentNameAttainmentRow(name, appointments, sessions, goals, range, profileNames, login?.id ?? null);
  });
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

  const agentField = useTaskFieldOptions('agent');
  const agentNames = useMemo(() => {
    const profileNames = Object.fromEntries(data.profiles.map((p) => [p.id, p.name || '']));
    const listNames = agentField.options.map((o) => o.value);
    return agentNamesForGoals(listNames, data.appointments, data.sessions, profileNames);
  }, [agentField.options, data.profiles, data.appointments, data.sessions]);

  const { profiles, appointments, sessions } = data;
  const weekRows = useMemo(
    () => computeRows(agentNames, profiles, appointments, sessions, goals, periodRange('week', reportDate)),
    [agentNames, profiles, appointments, sessions, goals, reportDate]
  );
  const monthRows = useMemo(
    () => computeRows(agentNames, profiles, appointments, sessions, goals, periodRange('month', reportDate)),
    [agentNames, profiles, appointments, sessions, goals, reportDate]
  );
  const quarterRows = useMemo(
    () => computeRows(agentNames, profiles, appointments, sessions, goals, periodRange('quarter', reportDate)),
    [agentNames, profiles, appointments, sessions, goals, reportDate]
  );

  return { goals, loading, weekRows, monthRows, quarterRows };
}
