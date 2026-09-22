import { getSupabase } from '../supabaseClient';
import type { AppointmentStatus } from '../types';

// Row shape as stored in / returned from public.appointments (see schema.sql).
// Field names match exactly what app.js reads/writes (snake_case DB columns).
export interface AppointmentRow {
  id: string;
  user_id: string;
  project_name: string;
  title: string;
  description: string | null;
  scheduled_time: string; // ISO timestamptz
  reminder_minutes: number;
  status: AppointmentStatus;
  timezone: string | null;
  created_at?: string;
}

export type UpsertAppointmentInput = Pick<AppointmentRow, 'id' | 'user_id' | 'title' | 'scheduled_time'> &
  Partial<Pick<AppointmentRow, 'project_name' | 'description' | 'reminder_minutes' | 'status' | 'timezone'>>;

// --- Per-user (app.js) ------------------------------------------------

// Upsert a batch of appointments (app.js's _syncApptsToDB — called from
// saveAppointments whenever the local list changes).
export async function upsertAppointments(appts: UpsertAppointmentInput[]) {
  const rows = appts.map((a) => ({
    id: a.id,
    user_id: a.user_id,
    project_name: a.project_name,
    title: a.title,
    description: a.description || '',
    scheduled_time: a.scheduled_time,
    reminder_minutes: a.reminder_minutes,
    status: a.status,
    timezone: a.timezone ?? null,
  }));
  return getSupabase().from('appointments').upsert(rows, { onConflict: 'id' });
}

// Mark an appointment completed (app.js's completeAppt).
export async function completeAppointment(id: string, userId: string) {
  return getSupabase().from('appointments').update({ status: 'completed' }).eq('id', id).eq('user_id', userId);
}

// Mark an appointment missed (app.js's missAppt, also used by the
// auto-mark-missed timer in _checkApptTimers via completeAppointment's sibling).
export async function missAppointment(id: string, userId: string) {
  return getSupabase().from('appointments').update({ status: 'missed' }).eq('id', id).eq('user_id', userId);
}

// Delete an appointment, scoped to its owner (app.js's deleteAppt).
export async function deleteAppointment(id: string, userId: string) {
  return getSupabase().from('appointments').delete().eq('id', id).eq('user_id', userId);
}

// Fetch all appointments for the current user, most recently scheduled first
// (used on initial load and by the "Refresh My List" button).
export async function listAppointmentsByUser(userId: string) {
  return getSupabase()
    .from('appointments')
    .select('*')
    .eq('user_id', userId)
    .order('scheduled_time', { ascending: false })
    .limit(1000);
}

// --- Admin / manager (admin.js) ----------------------------------------

// All appointments across all users, most recently scheduled first, optionally
// bounded by an ISO date range (admin dashboard date-range filter).
// RLS policy appt_manager_view restricts this to admin/manager roles.
export async function listAllAppointments(range?: { fromISO?: string | null; toISO?: string | null }) {
  let q = getSupabase().from('appointments').select('*').order('scheduled_time', { ascending: false }).limit(1000);
  if (range?.fromISO) q = q.gte('scheduled_time', range.fromISO);
  if (range?.toISO) q = q.lte('scheduled_time', range.toISO);
  return q;
}

// --- Realtime (app.js) --------------------------------------------------

export type AppointmentChangePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: AppointmentRow | null;
  old: Partial<AppointmentRow> | null;
};

// Subscribes to postgres_changes on appointments filtered to one user
// (rt-appts-<uid> channel in app.js). Caller owns the returned channel's
// lifecycle (call `getSupabase().removeChannel(channel)` on cleanup).
export function subscribeToAppointments(
  userId: string,
  onChange: (payload: AppointmentChangePayload) => void
) {
  return getSupabase()
    .channel('rt-appts-' + userId)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'appointments', filter: `user_id=eq.${userId}` },
      (payload) => onChange(payload as unknown as AppointmentChangePayload)
    )
    .subscribe();
}

// Admin dashboard variant: unfiltered (all users), fires on any change so the
// caller can debounce a full refreshAdminData()-style re-fetch (admin.js's
// admin-rt-appointments channel).
export function subscribeToAllAppointments(onChange: () => void, onStatusChange?: (status: string) => void) {
  return getSupabase()
    .channel('admin-rt-appointments')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, onChange)
    .subscribe((status) => onStatusChange?.(status));
}
