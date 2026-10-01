import { getSupabase } from '../supabaseClient';
import { SUPABASE_URL } from '../config';

// Admin Panel → create a team login directly, and reset a teammate's
// password — both go through the admin-create-user Edge Function, which is
// the only place with the service-role key needed to create/update an
// auth user. The function re-checks the caller's role server-side, so these
// are safe to call from the client; they're not a substitute for RLS.

const FN_URL = `${SUPABASE_URL}/functions/v1/admin-create-user`;
const DELETE_FN_URL = `${SUPABASE_URL}/functions/v1/admin-delete-user`;

interface FnResult<T = Record<string, never>> {
  ok: boolean;
  error?: string;
}

async function callFn<T>(body: Record<string, unknown>, url = FN_URL): Promise<{ data: (FnResult & T) | null; error: { message: string } | null }> {
  const { data: session } = await getSupabase().auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { data: null, error: { message: 'Please sign in again.' } };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({ ok: false, error: 'Unexpected response from server.' }))) as FnResult & T;
    if (!res.ok || !json.ok) return { data: null, error: { message: json.error || `Request failed (${res.status}).` } };
    return { data: json, error: null };
  } catch {
    return { data: null, error: { message: 'Network error — check your connection and try again.' } };
  }
}

export interface CreatedAccount {
  id: string;
  name: string;
  username: string;
  role: 'admin' | 'manager' | 'agent';
}

// Admins can create admin/manager/agent accounts; managers can only create agents.
export async function adminCreateAccount(input: {
  name: string;
  username: string;
  password: string;
  role: 'admin' | 'manager' | 'agent';
}) {
  return callFn<{ user: CreatedAccount }>({ action: 'create', ...input });
}

// Admins can reset anyone's password; managers can only reset agents'.
export async function adminResetPassword(userId: string, password: string) {
  return callFn<Record<string, never>>({ action: 'reset_password', userId, password });
}

// Admins can delete any account but their own; managers can only delete
// agents'. The person's login is removed; their past appointments and
// tracked time stay (they keep the agent name recorded on them).
export async function adminDeleteAccount(userId: string) {
  return callFn<{ deleted: { id: string; name: string } }>({ userId }, DELETE_FN_URL);
}
