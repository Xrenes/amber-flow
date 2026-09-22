// Hand-written to match schema.sql. Regenerate with the Supabase CLI
// (`supabase gen types typescript`) if the live schema diverges further —
// see the `timezone` column on `appointments`, which schema.sql itself
// doesn't declare but the live DB and app.js both use.
import type {
  Role,
  LeadStatus,
  AppointmentStatus,
  SessionStatus,
  NotificationStatus,
} from './types';

// Shape required by @supabase/postgrest-js's GenericTable/GenericView/GenericSchema.
export interface Table<Row extends Record<string, unknown>> {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
}

export interface View<Row extends Record<string, unknown>> {
  Row: Row;
  Relationships: [];
}

export interface Database {
  public: {
    Tables: {
      profiles: Table<{
        id: string;
        name: string;
        telegram_chat_id: string | null;
        role: Role;
        status: 'active' | 'inactive';
        created_at: string;
      }>;
      tasks: Table<{
        id: string;
        user_id: string;
        title: string;
        description: string | null;
        date: string;
        time: string;
        reminder_minutes: number;
        completed: boolean;
        lead_status: LeadStatus | null;
        timezone: string | null;
        created_at: string;
        updated_at: string;
      }>;
      appointments: Table<{
        id: string;
        user_id: string;
        project_name: string;
        title: string;
        description: string | null;
        scheduled_time: string;
        reminder_minutes: number;
        status: AppointmentStatus;
        timezone: string | null;
        created_at: string;
      }>;
      time_sessions: Table<{
        id: string;
        user_id: string;
        project_name: string;
        start_time: string;
        end_time: string | null;
        duration_seconds: number | null;
        status: SessionStatus;
        created_at: string;
      }>;
      activity_logs: Table<{
        id: string;
        user_id: string;
        action_type: string;
        reference_id: string | null;
        metadata: Record<string, unknown> | null;
        created_at: string;
      }>;
      notifications: Table<{
        id: string;
        user_id: string;
        message: string;
        status: NotificationStatus;
        created_at: string;
      }>;
    };
    Views: {
      daily_work_summary: View<{
        name: string;
        role: Role;
        work_date: string;
        sessions: number;
        total_seconds: number;
      }>;
      appointment_summary: View<{
        name: string;
        role: Role;
        appt_date: string;
        pending: number;
        completed: number;
        missed: number;
        total: number;
      }>;
    };
    Functions: Record<string, never>;
  };
}
