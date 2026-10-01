import { getSupabase } from '../supabaseClient';
import { SUPABASE_URL } from '../config';

// Accounts aren't tied to a real email — the Telegram Chat ID is normalized
// to digits and mapped to a synthetic address, matching the legacy web app
// (login.html: normalizeChatId / chatIdToEmail) so existing accounts keep working.
export function normalizeChatId(chatId: string) {
  return chatId.replace(/\D/g, '');
}

export function chatIdToEmail(chatId: string) {
  return `${normalizeChatId(chatId)}@tg.amberflow.internal`;
}

export async function getSession() {
  const { data } = await getSupabase().auth.getSession();
  return data.session;
}

export async function signOut() {
  await getSupabase().auth.signOut();
}

// Chat-ID + password sign in (main "Sign In" tab).
export async function signInWithChatId(chatId: string, password: string) {
  return getSupabase().auth.signInWithPassword({ email: chatIdToEmail(chatId), password });
}

// Final step of registration, after OTP has been verified via the Worker.
export async function signUpWithChatId(chatId: string, password: string, name: string) {
  return getSupabase().auth.signUp({
    email: chatIdToEmail(chatId),
    password,
    options: { data: { name, telegram_chat_id: normalizeChatId(chatId) } },
  });
}

// Team/internal login: Worker validates fixed credentials and returns a
// Supabase magic-link email+token pair, which is then exchanged here.
export async function verifyMagicLinkOtp(email: string, token: string) {
  return getSupabase().auth.verifyOtp({ email, token, type: 'magiclink' });
}

export async function ensureProfile(userId: string, name: string) {
  return getSupabase()
    .from('profiles')
    .upsert({ id: userId, name }, { onConflict: 'id', ignoreDuplicates: true });
}

export async function getProfile(userId: string) {
  return getSupabase()
    .from('profiles')
    .select('telegram_chat_id, name, role')
    .eq('id', userId)
    .single();
}

// Username + password sign in (desktop, web and mobile all use this — the
// same accounts created in Admin Panel -> People -> Team Accounts can sign
// in everywhere). profiles.username isn't queryable by an unauthenticated
// visitor under RLS, so the username-login Edge Function resolves
// username -> email and checks the password itself with the service key,
// returning a real access/refresh token pair that's installed here via
// setSession — not a Worker-issued magic link, so this has no dependency
// on the Cloudflare Worker being deployed.
export async function signInWithUsername(username: string, password: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/username-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({ ok: false, error: 'Network error.' }));
  if (!data.ok || !data.access_token || !data.refresh_token) {
    return { data: { user: null, session: null }, error: { message: data.error || 'Invalid username or password.' } };
  }
  return getSupabase().auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
}

// Direct Supabase email+password sign-in (used by the desktop/web login
// screen's "sign in with email" option, and by anyone whose account was
// given a real email rather than a username).
export async function signInWithEmail(email: string, password: string) {
  return getSupabase().auth.signInWithPassword({ email, password });
}
