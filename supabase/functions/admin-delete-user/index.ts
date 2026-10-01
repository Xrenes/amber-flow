// Amber Flow — admin account deletion (Supabase Edge Function).
//
// Admin Panel → People → Team Accounts "Delete" button calls this. Deleting
// an auth user needs the service-role key, which only exists here on the
// server. The caller must be signed in as an admin or manager; a manager
// may only delete agent accounts, and nobody can delete their own account
// (avoids locking yourself out).
//
// appointments.user_id and time_sessions.user_id reference auth.users ON
// DELETE CASCADE, so deleting a login would also delete all of that
// person's appointments and tracked time. To keep history, their rows are
// first handed over to the admin doing the deletion (user_id = caller),
// with agent_name filled in with the person's name where it was empty — so
// Reports still shows who the work was for. Only then is the login removed
// (profile, activity log and evaluations go with it).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authHeader = req.headers.get('Authorization') || '';
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: who } = await asCaller.auth.getUser();
  if (!who?.user) return json({ ok: false, error: 'Please sign in again.' }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: me } = await admin.from('profiles').select('role').eq('id', who.user.id).single();
  const myRole = me?.role;
  if (myRole !== 'admin' && myRole !== 'manager') {
    return json({ ok: false, error: 'Only admins and managers can manage accounts.' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Bad request.' }, 400);
  }
  const userId = String(body.userId || '');
  if (!userId) return json({ ok: false, error: 'Missing account.' }, 400);
  if (userId === who.user.id) return json({ ok: false, error: 'You can’t delete your own account.' }, 400);

  const { data: target } = await admin.from('profiles').select('role, name').eq('id', userId).single();
  if (!target) return json({ ok: false, error: 'Account not found.' }, 404);
  if (myRole !== 'admin' && target.role !== 'agent') {
    return json({ ok: false, error: 'Managers can only delete agent accounts.' }, 403);
  }

  // Keep their work: hand rows to the caller, labelling empty agent names.
  for (const table of ['appointments', 'time_sessions']) {
    const { error: nameErr } = await admin
      .from(table)
      .update({ agent_name: target.name || null })
      .eq('user_id', userId)
      .is('agent_name', null);
    if (nameErr) return json({ ok: false, error: `Couldn't keep ${table}: ${nameErr.message}` }, 500);
    const { error: moveErr } = await admin.from(table).update({ user_id: who.user.id }).eq('user_id', userId);
    if (moveErr) return json({ ok: false, error: `Couldn't keep ${table}: ${moveErr.message}` }, 500);
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return json({ ok: false, error: error.message }, 400);

  return json({ ok: true, deleted: { id: userId, name: target.name } });
});
