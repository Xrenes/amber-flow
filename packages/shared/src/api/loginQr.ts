import { getSupabase } from '../supabaseClient';

// Backs the desktop-QR-to-start-tracker feature: desktop generates/shows a
// token as a QR code once per login; mobile scans it and resolves it back
// to a user_id via the find_login_qr_token() RPC, which only succeeds when
// the scanning (mobile-authenticated) user owns that token — see
// migrations/012_desktop_qr_tracker_login.sql for the RLS/SECURITY DEFINER
// rationale.

function randomToken(): string {
  return (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Called once by the desktop app right after login. Upserts a fresh token
// for this user and returns it to render as a QR code. Session-long by
// design (not rotated on a timer) — a new token is only generated on the
// next login.
export async function ensureLoginQrToken(userId: string): Promise<string | null> {
  const token = randomToken();
  const { error } = await getSupabase()
    .from('login_qr_tokens')
    .upsert({ user_id: userId, token, created_at: new Date().toISOString() }, { onConflict: 'user_id' });
  return error ? null : token;
}

// Called by mobile after scanning. Returns the owning user_id only if the
// currently-authenticated mobile user IS that owner (enforced server-side);
// returns null for someone else's QR code, a stale/unknown token, or an RPC
// error.
export async function resolveLoginQrToken(token: string): Promise<string | null> {
  const { data, error } = await getSupabase().rpc('find_login_qr_token', { p_token: token });
  if (error || !data) return null;
  return data as string;
}
