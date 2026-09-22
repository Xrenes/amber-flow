export type Role = 'admin' | 'manager' | 'agent';
export type LeadStatus = 'S' | 'NS' | 'C';
export type AppointmentStatus = 'pending' | 'completed' | 'missed';
export type SessionStatus = 'running' | 'paused' | 'completed';
export type NotificationStatus = 'pending' | 'sent' | 'failed';

export interface Profile {
  id: string;
  name: string;
  telegram_chat_id: string | null;
  role: Role;
  status: 'active' | 'inactive';
  created_at?: string;
}

export interface Task {
  id: string; // client-generated uid
  user_id: string;
  title: string;
  description: string | null;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  reminder_minutes: number;
  completed: boolean;
  lead_status: LeadStatus | null;
  timezone: string | null; // IANA timezone
  created_at?: string;
  updated_at?: string;
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
