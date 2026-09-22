import { getSupabase } from '../supabaseClient';

// Row shape as stored in / returned from public.activity_logs (see schema.sql).
// Field names match exactly what app.js reads/writes (snake_case DB columns).
export interface ActivityLogRow {
  id: string;
  user_id: string;
  action_type: string;
  reference_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at?: string;
}

// --- Per-user (app.js) ------------------------------------------------

// Insert one activity log row (app.js's logActivity — fire-and-forget,
// powers the admin dashboard's activity feed). app.js always spreads
// { agentName, ...data } into metadata; callers should do the same.
export async function insertActivityLog(
  userId: string,
  actionType: string,
  metadata: Record<string, unknown> = {}
) {
  return getSupabase().from('activity_logs').insert({
    user_id: userId,
    action_type: actionType,
    metadata,
  });
}

// --- Admin / manager (admin.js) ----------------------------------------

// All activity logs across all users, most recent first, optionally bounded
// by an ISO date range (admin dashboard date-range filter + Activity tab feed).
// RLS policy logs_manager_view restricts this to admin/manager roles.
export async function listAllActivityLogs(range?: { fromISO?: string | null; toISO?: string | null }) {
  let q = getSupabase().from('activity_logs').select('*').order('created_at', { ascending: false }).limit(500);
  if (range?.fromISO) q = q.gte('created_at', range.fromISO);
  if (range?.toISO) q = q.lte('created_at', range.toISO);
  return q;
}

// --- Realtime (admin.js) -------------------------------------------------

// Admin dashboard variant: unfiltered (all users), fires on any change so the
// caller can debounce a full refreshAdminData()-style re-fetch (admin.js's
// admin-rt-activity_logs channel).
export function subscribeToAllActivityLogs(onChange: () => void, onStatusChange?: (status: string) => void) {
  return getSupabase()
    .channel('admin-rt-activity_logs')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, onChange)
    .subscribe((status) => onStatusChange?.(status));
}
