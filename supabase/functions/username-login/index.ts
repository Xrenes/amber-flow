// Amber Flow — username + password sign-in (Supabase Edge Function).
//
// Mobile (and any client) signs in with a username rather than an email.
// profiles.username -> email resolution needs the service-role key (an
// unauthenticated visitor can't query profiles directly under RLS), so the
// whole check happens here: look up the account's real email, then do a
// genuine password check via GoTrue's password grant (the same check
// supabase-js's signInWithPassword does) — never exposing whether a
// username exists; a bad username and a bad password return the identical
// error, and the resolved email is never sent back to the client.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const INVALID = { ok: false, error: 'Invalid username or password.' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Bad request.' }, 400);
  }
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!username || !password) return json({ ok: false, error: 'Username and password required.' }, 400);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: profile } = await admin.from('profiles').select('id, status').ilike('username', username).single();
  if (!profile) return json(INVALID, 401);
  // A deactivated account (Team Accounts / Settings) can't sign in — same
  // generic error as a wrong username/password, so it isn't distinguishable
  // from the outside.
  if (profile.status === 'inactive') return json(INVALID, 401);

  const { data: authUser, error: lookupErr } = await admin.auth.admin.getUserById(profile.id);
  if (lookupErr || !authUser?.user?.email) return json(INVALID, 401);

  // Real password check — same grant signInWithPassword uses client-side,
  // just performed here since this is the only place that knows the email.
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: session, error: pwErr } = await anon.auth.signInWithPassword({
    email: authUser.user.email,
    password,
  });
  if (pwErr || !session?.session) return json(INVALID, 401);

  return json({
    ok: true,
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
  });
});
