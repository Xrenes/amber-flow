import { getSupabase } from '../supabaseClient';
import type { AppointmentStatus, ShowStatus } from '../types';

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
  show_status: ShowStatus | null;
  account_name: string | null;
  agent_name: string | null;
  created_at?: string;
}

export type UpsertAppointmentInput = Pick<AppointmentRow, 'id' | 'user_id' | 'title' | 'scheduled_time'> &
  Partial<
    Pick<
      AppointmentRow,
      | 'project_name'
      | 'description'
      | 'reminder_minutes'
      | 'status'
      | 'timezone'
      | 'show_status'
      | 'account_name'
      | 'agent_name'
      | 'created_at'
    >
  >;

// Every field of an appointment, as activity_logs metadata. Each appointment
// action logs the whole row (not just a few display fields) so the log is a
// full backup: any field the appointments table loses can be restored from
// it. The display keys (projectName, title, accountName, scheduledTime,
// timezone) are the ones the Activity views already read.
export function appointmentLogMetadata(a: Partial<AppointmentRow> | undefined): Record<string, unknown> {
  if (!a) return {};
  return {
    appointmentId: a.id,
    bookedBy: a.user_id,
    projectName: a.project_name,
    title: a.title,
    description: a.description ?? null,
    accountName: a.account_name ?? null,
    agentName: a.agent_name ?? null,
    scheduledTime: a.scheduled_time,
    timezone: a.timezone ?? null,
    reminderMinutes: a.reminder_minutes,
    status: a.status,
    showStatus: a.show_status ?? null,
    createdAt: a.created_at,
  };
}

// --- Per-user (app.js) ------------------------------------------------

// An UPDATE/DELETE that RLS filters out returns no error and zero rows —
// turn that into a real error so the UI doesn't show a change that never
// happened.
async function requireRow(
  q: PromiseLike<{ data: { id: string }[] | null; error: { message: string } | null }>,
  what: string
) {
  const { data, error } = await q;
  if (error) return { data: null, error };
  if (!data || data.length === 0) {
    return { data: null, error: { message: `You don't have permission to ${what} this appointment.` } };
  }
  return { data, error: null };
}

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
    show_status: a.show_status ?? null,
    account_name: a.account_name ?? null,
    agent_name: a.agent_name ?? null,
    // The booking time travels with the row, so a re-save (or a row that is
    // re-inserted) keeps the original "Booked" date instead of "now".
    ...(a.created_at ? { created_at: a.created_at } : {}),
  }));
  return getSupabase().from('appointments').upsert(rows, { onConflict: 'id' });
}

// Edit an existing appointment's details without touching who saved it
// (user_id) — so an admin/manager editing a teammate's row from Reports
// doesn't take it over. RLS decides who may edit (own row or admin/manager).
export type AppointmentFieldUpdate = Partial<
  Pick<
    AppointmentRow,
    | 'project_name'
    | 'title'
    | 'description'
    | 'scheduled_time'
    | 'timezone'
    | 'reminder_minutes'
    | 'account_name'
    | 'agent_name'
    | 'status'
    | 'show_status'
  >
>;

export async function updateAppointmentFields(id: string, fields: AppointmentFieldUpdate) {
  return requireRow(getSupabase().from('appointments').update(fields).eq('id', id).select('id'), 'edit');
}

// Mark an appointment completed (app.js's completeAppt). `showStatus`
// records the BPO show/no-show outcome — optional so existing callers that
// don't care still work, but the admin-facing show-rate metric depends on
// callers passing it.
// Who may change a row is enforced by RLS (appt_update_own_or_manager: the
// row's own saver, or any admin/manager) — not by an extra user_id filter
// here, since Reports lets admins act on everyone's appointments. userId is
// kept in the signature for existing callers.
export async function completeAppointment(id: string, _userId: string, showStatus?: ShowStatus) {
  return requireRow(
    getSupabase()
      .from('appointments')
      .update({ status: 'completed', ...(showStatus ? { show_status: showStatus } : {}) })
      .eq('id', id)
      .select('id'),
    'complete'
  );
}

// Mark an appointment missed (app.js's missAppt, also used by the
// auto-mark-missed timer in _checkApptTimers via completeAppointment's sibling).
export async function missAppointment(id: string, _userId: string) {
  return requireRow(getSupabase().from('appointments').update({ status: 'missed' }).eq('id', id).select('id'), 'change');
}

// Delete an appointment (app.js's deleteAppt) — RLS limits this to the
// row's own saver or an admin/manager (appt_delete_own_or_manager).
export async function deleteAppointment(id: string, _userId: string) {
  return requireRow(getSupabase().from('appointments').delete().eq('id', id).select('id'), 'delete');
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

// Every appointment from every agent, most recently scheduled first — used
// by Reports (desktop My Reports / mobile Reports), which now shows
// everyone's appointments attributed by agent_name, not just "my own
// login's". Any signed-in user can read this (see migration 028's
// appt_select_all policy) — it's not admin-only like listAllAppointments.
export async function listAllAppointmentsForReports() {
  return getSupabase().from('appointments').select('*').order('scheduled_time', { ascending: false }).limit(2000);
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
