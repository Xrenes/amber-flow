import { getSupabase } from '../supabaseClient';
import type { LeadStatus } from '../types';

// Row shape as stored in / returned from public.tasks (see schema.sql).
// Field names match exactly what app.js reads/writes (snake_case DB columns).
export interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  reminder_minutes: number;
  completed: boolean;
  lead_status: LeadStatus | null;
  timezone: string | null;
  agent_name: string | null;
  account_name: string | null;
  campaign_name: string | null;
  created_at?: string;
  updated_at?: string;
}

export type UpsertTaskInput = Pick<TaskRow, 'id' | 'user_id' | 'title' | 'date' | 'time'> &
  Partial<
    Pick<
      TaskRow,
      | 'description'
      | 'reminder_minutes'
      | 'completed'
      | 'lead_status'
      | 'timezone'
      | 'agent_name'
      | 'account_name'
      | 'campaign_name'
    >
  >;

// --- Per-user (app.js) ------------------------------------------------

// Upsert a single task (fire-and-forget in app.js's syncTaskToSupabase).
export async function upsertTask(task: UpsertTaskInput) {
  return getSupabase()
    .from('tasks')
    .upsert(
      {
        id: task.id,
        user_id: task.user_id,
        title: task.title,
        description: task.description ?? null,
        date: task.date,
        time: task.time,
        reminder_minutes: task.reminder_minutes ?? 60,
        completed: task.completed ?? false,
        lead_status: task.lead_status ?? null,
        timezone: task.timezone ?? null,
        agent_name: task.agent_name ?? null,
        account_name: task.account_name ?? null,
        campaign_name: task.campaign_name ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
}

// Delete a task, scoped to its owner (app.js's deleteTaskFromSupabase).
export async function deleteTask(id: string, userId: string) {
  return getSupabase().from('tasks').delete().eq('id', id).eq('user_id', userId);
}

// Fetch all tasks for the current user, ordered by date ascending
// (used both on the "Refresh My List" button and on initial load).
export async function listTasksByUser(userId: string) {
  return getSupabase()
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true })
    .limit(2000);
}

// --- Admin / manager (admin.js) ----------------------------------------

// All tasks across all users, newest date first (admin dashboard "Tasks" tab).
// RLS policy tasks_manager_view restricts this to admin/manager roles.
export async function listAllTasks() {
  return getSupabase().from('tasks').select('*').order('date', { ascending: false }).limit(2000);
}

// --- Realtime (app.js) --------------------------------------------------

export type TaskChangePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: TaskRow | null;
  old: Partial<TaskRow> | null;
};

// Subscribes to postgres_changes on tasks filtered to one user (rt-tasks-<uid>
// channel in app.js). Caller owns the returned channel's lifecycle
// (call `getSupabase().removeChannel(channel)` on cleanup).
export function subscribeToTasks(userId: string, onChange: (payload: TaskChangePayload) => void) {
  return getSupabase()
    .channel('rt-tasks-' + userId)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${userId}` },
      (payload) => onChange(payload as unknown as TaskChangePayload)
    )
    .subscribe();
}

// Admin dashboard variant: unfiltered (all users), fires on any change so the
// caller can debounce a full refreshAdminData()-style re-fetch (admin.js's
// admin-rt-tasks channel — onStatusChange mirrors admin.js's per-channel
// subscribe(status => ...) callback used to light up the "live" indicator).
export function subscribeToAllTasks(onChange: () => void, onStatusChange?: (status: string) => void) {
  return getSupabase()
    .channel('admin-rt-tasks')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, onChange)
    .subscribe((status) => onStatusChange?.(status));
}
