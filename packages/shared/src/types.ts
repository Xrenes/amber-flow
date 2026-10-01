export type Role = 'admin' | 'manager' | 'agent';
export type AppointmentStatus = 'pending' | 'completed' | 'missed';
export type ShowStatus = 'showed' | 'no_show' | 'uncertain';
export type SessionStatus = 'running' | 'paused' | 'completed';
export type NotificationStatus = 'pending' | 'sent' | 'failed';
export type TaskFieldName = 'account' | 'campaign' | 'project' | 'agent';
export type TaskFieldMode = 'dropdown' | 'text';
export type PresenceStatus = 'active' | 'idle' | 'away';

export interface Profile {
  id: string;
  name: string;
  username: string | null;
  telegram_chat_id: string | null;
  role: Role;
  status: 'active' | 'inactive';
  created_at?: string;
}

// Admin-managed value for the Account/Campaign dropdowns (task_field_options).
// Table/type names kept from when these fields were Task-only — they're now
// shared with Appointments (Tasks were removed from the app entirely).
export interface TaskFieldOption {
  id: string;
  field: TaskFieldName;
  value: string;
  created_at?: string;
}

// Per-field input mode admin toggles between dropdown and free text
// (task_field_config) — one row per field, seeded for 'account' and 'campaign'.
export interface TaskFieldConfig {
  field: TaskFieldName;
  mode: TaskFieldMode;
}

export interface Appointment {
  id: string;
  user_id: string;
  project_name: string;
  title: string;
  description: string | null;
  scheduled_time: string;
  reminder_minutes: number;
  status: AppointmentStatus;
  timezone: string | null; // IANA timezone; not in schema.sql but written by the app — live DB has this column
  show_status: ShowStatus | null; // did the client show up — set when marking completed
  account_name: string | null; // admin-managed dropdown or free text
  // The admin-managed Agent list name this appointment is FOR (Field
  // Options, field 'agent') — the authoritative "Agent" shown everywhere.
  // Independent of user_id (who signed in and saved the row) and of
  // anyone's display name — see agentOptions.ts.
  agent_name: string | null;
  created_at?: string;
}

export interface TimeSession {
  id: string;
  user_id: string;
  project_name: string;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  status: SessionStatus;
  // The admin-managed Agent list name this tracked session is FOR (same
  // concept as Appointment.agent_name) — independent of user_id/display name.
  agent_name: string | null;
  created_at?: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  action_type: string;
  reference_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at?: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  message: string;
  status: NotificationStatus;
  created_at?: string;
}

export interface Plugin {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  updated_at?: string;
}

export interface Presence {
  user_id: string;
  status: PresenceStatus;
  last_active: string;
  updated_at?: string;
}

// A goal rule scoped by user_id/campaign_name (both nullable — NULL means
// "applies to all"). Resolution order for a given agent+campaign is most
// specific first: agent+campaign > agent-only > campaign-only > global (both
// NULL). See migrations/013_agent_goals.sql.
export interface AgentGoal {
  id: string;
  user_id: string | null;
  campaign_name: string | null;
  daily_appointment_goal: number;
  daily_show_goal: number;
  created_at?: string;
  updated_at?: string;
}

// Admin-managed evaluation criterion (e.g. "Communication", "Reliability").
export interface EvaluationCriterion {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  created_at?: string;
}

export interface Evaluation {
  id: string;
  agent_id: string;
  evaluator_id: string;
  evaluation_date: string; // YYYY-MM-DD
  notes: string | null;
  visible_to_agent: boolean;
  created_at?: string;
  updated_at?: string;
}

// One score per criterion within an evaluation. `rating` is recorded as-is
// for now — not validated against a fixed scale.
export interface EvaluationScore {
  id: string;
  evaluation_id: string;
  criterion_id: string;
  rating: number | null;
  notes: string | null;
}
