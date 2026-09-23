import { getSupabase } from '../supabaseClient';
import { WORKER_URL } from '../config';
import type { Role } from '../types';

export interface AccountRequest {
  id: string;
  name: string;
  contact: string;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

// Submitted from the login screen — no auth required, RLS allows anonymous
// insert only (see migrations/002_*.sql).
export async function submitAccountRequest(name: string, contact: string, note?: string) {
  return getSupabase()
    .from('account_requests')
    .insert({ name: name.trim(), contact: contact.trim(), note: note?.trim() || null });
}

// Admin/manager only (RLS-enforced).
export async function listAccountRequests() {
  return getSupabase().from('account_requests').select('*').order('created_at', { ascending: false });
}

export async function rejectAccountRequest(id: string) {
  return getSupabase()
    .from('account_requests')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
    .eq('id', id);
}

// Creates the real Supabase account + profile via the Worker (needs the
// service key) and marks the request approved. Caller must be signed in as
// admin/manager — the Worker re-verifies this server-side from the access token.
export async function approveAccountRequest(
  requestId: string,
  username: string,
  password: string,
  name: string,
  role: Role = 'agent'
) {
  const { data: sessionData } = await getSupabase().auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return { ok: false, error: 'Not authenticated.' };

  const res = await fetch(`${WORKER_URL}/approve-account-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ requestId, username, password, name, role }),
  });
  return res.json().catch(() => ({ ok: false, error: 'Network error.' }));
}
