// Agent dropdowns combine two kinds of agents:
//   - team members with a login (profiles) — value is their user id
//   - agent names an admin added in Field Options (task_field_options,
//     field 'agent') for people who don't have an account yet — value is
//     NAME_PREFIX + the name
// Picking a name-only agent books the appointment under the person booking
// it (appointments.user_id must be a real account) and records the chosen
// name in appointments.agent_name, which is what every Agent column shows.

export const AGENT_NAME_PREFIX = 'name:';

export interface AgentOption {
  value: string;
  label: string;
}

export function buildAgentOptions(
  members: { id: string; name: string }[],
  agentNames: string[],
  currentUserId?: string
): AgentOption[] {
  const out: AgentOption[] = members.map((m) => ({
    value: m.id,
    label: m.id === currentUserId ? `${m.name} (me)` : m.name,
  }));
  const taken = new Set(members.map((m) => m.name.trim().toLowerCase()));
  agentNames.forEach((n) => {
    const name = n.trim();
    if (!name || taken.has(name.toLowerCase())) return;
    taken.add(name.toLowerCase());
    out.push({ value: AGENT_NAME_PREFIX + name, label: name });
  });
  return out;
}

// Turns a dropdown value back into who owns the appointment + the name to record.
export function parseAgentValue(value: string, currentUserId: string): { userId: string; agentName: string | null } {
  if (value.startsWith(AGENT_NAME_PREFIX)) {
    return { userId: currentUserId, agentName: value.slice(AGENT_NAME_PREFIX.length) };
  }
  return { userId: value || currentUserId, agentName: null };
}

// The dropdown value that represents an existing appointment's agent.
export function agentValueFor(appt: { user_id: string; agent_name?: string | null }): string {
  return appt.agent_name ? AGENT_NAME_PREFIX + appt.agent_name : appt.user_id;
}
