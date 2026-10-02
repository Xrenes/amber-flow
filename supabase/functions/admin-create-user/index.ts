// Amber Flow — admin account management (Supabase Edge Function).
//
// Admin Panel → People → Team Accounts / Settings calls this to:
//   action "create":          make a new login (name, username, password, role)
//   action "update":          change an existing account's name/username/role/status
//   action "reset_password":  set a new password for an existing account
//
// Creating/updating auth users needs the service-role key, which only
// exists here on the server. The caller must be signed in as an admin or
// manager (checked against profiles.role). A manager may only create/
// reset/edit agents; only an admin may create managers/admins or change
// anyone's role; nobody may change their own role or deactivate themselves
// (avoids locking the account out).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const USERNAME_RE = /^[a-z0-9._-]{2,32}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Who is calling?
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
  const action = body.action;

  // ── create ──────────────────────────────────────────────────────────────
  if (action === 'create') {
    const name = String(body.name || '').trim();
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const requested = body.role === 'admin' || body.role === 'manager' ? (body.role as string) : 'agent';
    // Managers can only create agents.
    const role = requested !== 'agent' && myRole !== 'admin' ? 'agent' : requested;

    if (!name) return json({ ok: false, error: 'Enter the person’s name.' }, 400);
    if (!USERNAME_RE.test(username)) {
      return json({ ok: false, error: 'Username must be 2–32 characters: letters, numbers, dot, dash or underscore.' }, 400);
    }
    if (password.length < 8) return json({ ok: false, error: 'Password must be at least 8 characters.' }, 400);

    const { data: taken } = await admin.from('profiles').select('id').ilike('username', username).limit(1);
    if (taken && taken.length) return json({ ok: false, error: `The username “${username}” is already taken.` }, 409);

    const email = `${username}@amberflow.internal`;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
      app_metadata: { role },
    });
    if (createErr || !created?.user) {
      const msg = createErr?.message || 'Could not create the account.';
      return json({ ok: false, error: /already/i.test(msg) ? `The username “${username}” is already taken.` : msg }, 400);
    }

    // handle_new_user() made the profiles row (as an agent) — set the rest.
    const { error: profErr } = await admin
      .from('profiles')
      .upsert({ id: created.user.id, name, username, role, status: 'active' }, { onConflict: 'id' });
    if (profErr) {
      await admin.auth.admin.deleteUser(created.user.id); // don't leave a half-made account
      return json({ ok: false, error: `Could not save the profile: ${profErr.message}` }, 500);
    }

    return json({ ok: true, user: { id: created.user.id, name, username, role } });
  }

  // ── reset_password ──────────────────────────────────────────────────────
  if (action === 'reset_password') {
    const userId = String(body.userId || '');
    const password = String(body.password || '');
    if (!userId) return json({ ok: false, error: 'Missing account.' }, 400);
    if (password.length < 8) return json({ ok: false, error: 'Password must be at least 8 characters.' }, 400);

    const { data: target } = await admin.from('profiles').select('role').eq('id', userId).single();
    if (!target) return json({ ok: false, error: 'Account not found.' }, 404);
    if (myRole !== 'admin' && target.role !== 'agent') {
      return json({ ok: false, error: 'Managers can only reset passwords for agents.' }, 403);
    }

    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) return json({ ok: false, error: error.message }, 400);
    return json({ ok: true });
  }

  // ── update ──────────────────────────────────────────────────────────────
  // Changes any of: name, username, role, status. Only the fields present in
  // the request body are touched, so the client can send just one at a time
  // (e.g. a quick "Deactivate" click) or several together (an edit form).
  if (action === 'update') {
    const userId = String(body.userId || '');
    if (!userId) return json({ ok: false, error: 'Missing account.' }, 400);

    const { data: target } = await admin.from('profiles').select('role, username').eq('id', userId).single();
    if (!target) return json({ ok: false, error: 'Account not found.' }, 404);
    if (myRole !== 'admin' && target.role !== 'agent') {
      return json({ ok: false, error: 'Managers can only edit agent accounts.' }, 403);
    }

    const isSelf = userId === who.user.id;
    const profilePatch: Record<string, unknown> = {};
    const authPatch: Record<string, unknown> = {};

    if (typeof body.name === 'string') {
      const name = body.name.trim();
      if (!name) return json({ ok: false, error: 'Name can’t be empty.' }, 400);
      profilePatch.name = name;
      authPatch.user_metadata = { name };
    }

    if (typeof body.username === 'string') {
      const username = body.username.trim().toLowerCase();
      if (!USERNAME_RE.test(username)) {
        return json({ ok: false, error: 'Username must be 2–32 characters: letters, numbers, dot, dash or underscore.' }, 400);
      }
      if (username !== target.username) {
        const { data: taken } = await admin.from('profiles').select('id').ilike('username', username).neq('id', userId).limit(1);
        if (taken && taken.length) return json({ ok: false, error: `The username “${username}” is already taken.` }, 409);
        profilePatch.username = username;
        // The live username-login function resolves username -> email via
        // this exact pattern, so the login stays working after the rename.
        authPatch.email = `${username}@amberflow.internal`;
        authPatch.email_confirm = true;
      }
    }

    if (typeof body.role === 'string' && ['admin', 'manager', 'agent'].includes(body.role)) {
      if (myRole !== 'admin') return json({ ok: false, error: 'Only admins can change roles.' }, 403);
      if (isSelf) return json({ ok: false, error: 'You can’t change your own role.' }, 400);
      profilePatch.role = body.role;
      authPatch.app_metadata = { role: body.role };
    }

    if (typeof body.status === 'string' && ['active', 'inactive'].includes(body.status)) {
      if (isSelf) return json({ ok: false, error: 'You can’t deactivate your own account.' }, 400);
      profilePatch.status = body.status;
    }

    if (!Object.keys(profilePatch).length) return json({ ok: false, error: 'Nothing to update.' }, 400);

    if (Object.keys(authPatch).length) {
      const { error: authErr } = await admin.auth.admin.updateUserById(userId, authPatch);
      if (authErr) return json({ ok: false, error: authErr.message }, 400);
    }

    const { error: profErr } = await admin.from('profiles').update(profilePatch).eq('id', userId);
    if (profErr) return json({ ok: false, error: `Could not save the profile: ${profErr.message}` }, 500);

    return json({ ok: true, user: { id: userId, ...profilePatch } });
  }

  return json({ ok: false, error: 'Unknown action.' }, 400);
});
