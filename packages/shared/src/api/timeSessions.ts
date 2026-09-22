import { getSupabase } from '../supabaseClient';
import type { SessionStatus } from '../types';

// Row shape as stored in / returned from public.time_sessions (see schema.sql).
// Field names match exactly what app.js reads/writes (snake_case DB columns).
export interface TimeSessionRow {
  id: string;
  user_id: string;
  project_name: string;
  start_time: string; // ISO timestamptz
  end_time: string | null;
  duration_seconds: number | null;
  status: SessionStatus;
  created_at?: string;
}

export interface UpsertTimeSessionInput {
  id: string;
  user_id: string;
  project_name: string;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  status?: SessionStatus;
}

// --- Per-user (app.js) ------------------------------------------------

// Upsert a batch of completed sessions (app.js's _syncSessionsToDB — only
// called with sessions that have an `end`; status is always 'completed').
export async function upsertTimeSessions(sessions: UpsertTimeSessionInput[]) {
  const rows = sessions.map((s) => ({
    id: s.id,
    user_id: s.user_id,
    project_name: s.project_name || 'General',
    start_time: s.start_time,
    end_time: s.end_time,
    duration_seconds: s.duration_seconds,
    status: 'completed' as const,
  }));
  return getSupabase().from('time_sessions').upsert(rows, { onConflict: 'id' });
}

// Delete a session, scoped to its owner (app.js's _deleteSessionFromDB).
export async function deleteTimeSession(id: string, userId: string) {
  return getSupabase().from('time_sessions').delete().eq('id', id).eq('user_id', userId);
}

// Fetch the current user's sessions, most recent first. app.js uses limit 200
// both on init load and on the debounced realtime re-fetch.
export async function listTimeSessionsByUser(userId: string, limit = 200) {
  return getSupabase()
    .from('time_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('start_time', { ascending: false })
    .limit(limit);
}

// --- Admin / manager (admin.js) ----------------------------------------

// All time sessions across all users, most recent first, optionally bounded
// by an ISO date range (admin dashboard date-range filter).
// RLS policy sessions_manager_view restricts this to admin/manager roles.
export async function listAllTimeSessions(range?: { fromISO?: string | null; toISO?: string | null }) {
  let q = getSupabase().from('time_sessions').select('*').order('start_time', { ascending: false }).limit(1000);
  if (range?.fromISO) q = q.gte('start_time', range.fromISO);
  if (range?.toISO) q = q.lte('start_time', range.toISO);
  return q;
}

// --- Realtime (app.js) --------------------------------------------------

export type TimeSessionChangePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: TimeSessionRow | null;
  old: Partial<TimeSessionRow> | null;
};

// Subscribes to postgres_changes on time_sessions filtered to one user
// (rt-sessions-<uid> channel in app.js — app.js debounces and re-fetches via
// listTimeSessionsByUser on every event rather than applying the payload
// directly; this port preserves that same raw-payload handoff to the caller).
export function subscribeToTimeSessions(
  userId: string,
  onChange: (payload: TimeSessionChangePayload) => void
) {
  return getSupabase()
    .channel('rt-sessions-' + userId)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'time_sessions', filter: `user_id=eq.${userId}` },
      (payload) => onChange(payload as unknown as TimeSessionChangePayload)
    )
    .subscribe();
}

// Admin dashboard variant: unfiltered (all users), fires on any change so the
// caller can debounce a full refreshAdminData()-style re-fetch (admin.js's
// admin-rt-time_sessions channel).
export function subscribeToAllTimeSessions(onChange: () => void, onStatusChange?: (status: string) => void) {
  return getSupabase()
    .channel('admin-rt-time_sessions')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'time_sessions' }, onChange)
    .subscribe((status) => onStatusChange?.(status));
}
