import { getSupabase } from '../supabaseClient';
import type { AgentGoal } from '../types';

// Goal rules (daily appointment/show targets), scoped globally, per-campaign,
// or per-agent — see migrations/013_agent_goals.sql for the resolution order.
// Read is open to everyone (agents see their own targets/status); writes are
// admin/manager only.

export async function listAgentGoals() {
  return getSupabase().from('agent_goals').select('*').order('created_at', { ascending: true });
}

export interface UpsertAgentGoalInput {
  id?: string;
  // At most one of userId / agentName is set — a login-based override or a
  // plain-name override (for an agent with no login). Both null = global.
  userId: string | null;
  agentName: string | null;
  campaignName: string | null;
  dailyAppointmentGoal: number;
  dailyShowGoal: number;
}

export async function upsertAgentGoal(input: UpsertAgentGoalInput) {
  const row = {
    ...(input.id ? { id: input.id } : {}),
    user_id: input.userId,
    agent_name: input.userId ? null : input.agentName,
    campaign_name: input.campaignName,
    daily_appointment_goal: input.dailyAppointmentGoal,
    daily_show_goal: input.dailyShowGoal,
    updated_at: new Date().toISOString(),
  };
  return getSupabase().from('agent_goals').upsert(row);
}

export async function deleteAgentGoal(id: string) {
  return getSupabase().from('agent_goals').delete().eq('id', id);
}

// Bulk variant for the spreadsheet import tool. agent_goals' real uniqueness
// constraint is an expression index (COALESCE(user_id,...), COALESCE(
// campaign_name,...)) — PostgREST's upsert onConflict only accepts a plain
// column list, not an expression index, so a single upsert() call can't
// target it. Instead: fetch existing goals, match each input row to an
// existing row's id by the same (user_id, campaign_name) scope, then upsert
// on id — inserting rows with no match, updating the ones that do.
export async function upsertAgentGoalsBulk(inputs: UpsertAgentGoalInput[]) {
  const { data: existing } = await listAgentGoals();
  const existingRows = (existing as AgentGoal[]) || [];

  const rows = inputs.map((input) => {
    const agentName = input.userId ? null : input.agentName;
    const match = existingRows.find(
      (g) =>
        g.user_id === input.userId &&
        (g.agent_name || '').toLowerCase() === (agentName || '').toLowerCase() &&
        g.campaign_name === input.campaignName
    );
    return {
      id: input.id || match?.id,
      user_id: input.userId,
      agent_name: agentName,
      campaign_name: input.campaignName,
      daily_appointment_goal: input.dailyAppointmentGoal,
      daily_show_goal: input.dailyShowGoal,
      updated_at: new Date().toISOString(),
    };
  });

  return getSupabase().from('agent_goals').upsert(rows, { onConflict: 'id' });
}

export function subscribeToAgentGoals(onChange: () => void) {
  return getSupabase()
    .channel('agent-goals-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_goals' }, onChange)
    .subscribe();
}

// Resolves the effective goal for a given agent+campaign from the full list
// of goal rules, most-specific-first: agent+campaign > agent-only >
// campaign-only > global (both null). "Agent" is matched by login (userId)
// when the agent has one, OR by plain name (agentName, case-insensitive) —
// so a name-only agent (no login) can get a per-agent override too, the
// same as a logged-in one. Falls back to the sheet's original defaults
// (3 appointments / 2 shows) if no rule matches at all (e.g. the seeded
// global row was deleted).
export function resolveAgentGoal(
  goals: AgentGoal[],
  userId: string,
  campaignName: string | null,
  agentName: string | null = null
): { dailyAppointmentGoal: number; dailyShowGoal: number } {
  const name = (agentName || '').trim().toLowerCase();
  const isAgent = (g: AgentGoal) => (userId && g.user_id === userId) || (!!name && (g.agent_name || '').toLowerCase() === name);

  const byAgentAndCampaign = campaignName ? goals.find((g) => isAgent(g) && g.campaign_name === campaignName) : undefined;
  if (byAgentAndCampaign) {
    return {
      dailyAppointmentGoal: byAgentAndCampaign.daily_appointment_goal,
      dailyShowGoal: byAgentAndCampaign.daily_show_goal,
    };
  }

  const byAgent = goals.find((g) => isAgent(g) && g.campaign_name === null);
  if (byAgent) {
    return { dailyAppointmentGoal: byAgent.daily_appointment_goal, dailyShowGoal: byAgent.daily_show_goal };
  }

  const byCampaign = campaignName
    ? goals.find((g) => g.user_id === null && !g.agent_name && g.campaign_name === campaignName)
    : undefined;
  if (byCampaign) {
    return { dailyAppointmentGoal: byCampaign.daily_appointment_goal, dailyShowGoal: byCampaign.daily_show_goal };
  }

  const global = goals.find((g) => g.user_id === null && !g.agent_name && g.campaign_name === null);
  if (global) {
    return { dailyAppointmentGoal: global.daily_appointment_goal, dailyShowGoal: global.daily_show_goal };
  }

  return { dailyAppointmentGoal: 3, dailyShowGoal: 2 };
}
