// Agent dropdowns (New Appointment, Time Tracker) are built ONLY from the
// admin-managed Agent list in Field Options (task_field_options, field
// 'agent') — never from team members' login/display names. Logging in and
// being an "agent" are now separate concepts: who signs in to use the app
// is not necessarily who the work gets attributed to, and a display-name
// change must never silently change what's recorded on past appointments.
//
// Picking a name books/tracks the appointment or session under whoever is
// signed in (appointments.user_id / time_sessions.user_id must be a real
// account for RLS), and records the chosen name separately —
// appointments.agent_name — which is what every "Agent" column shows.
// There is no dropdown option whose value is a user id; agent_name is
// always a plain string chosen from this admin-managed list (or typed, in
// Free text mode).

export interface AgentOption {
  value: string;
  label: string;
}

// options come straight from task_field_options (field='agent'); `current`
// is the agent_name already on the row being edited (if any), so it stays
// selectable even if later removed from the list.
export function buildAgentOptions(names: string[], current?: string | null): AgentOption[] {
  const seen = new Set<string>();
  const out: AgentOption[] = [];
  const add = (n: string) => {
    const name = n.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return;
    seen.add(key);
    out.push({ value: name, label: name });
  };
  names.forEach(add);
  if (current) add(current);
  return out;
}
