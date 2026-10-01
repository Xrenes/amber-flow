-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — Desktop QR code for starting/pausing Tracker from mobile
-- Run this in: Supabase Dashboard → SQL Editor → New Query (after 011_*.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- One row per user. The desktop app generates a random `token` and upserts
-- it here once, when that user logs into the desktop app (not rotated on a
-- timer — session-long, per the confirmed design). Desktop renders `token`
-- as a QR code. The mobile app scans it and calls find_login_qr_token(),
-- which only succeeds if the scanning (mobile-authenticated) user's id
-- matches user_id on the row — i.e. an agent can only use this to start
-- their OWN tracker, proving they're physically at their own desk, not
-- anyone else's screen. Mobile then drives the same start/pause/resume
-- state machine the on-screen Tracker buttons already use.
CREATE TABLE IF NOT EXISTS public.login_qr_tokens (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS login_qr_tokens_token_idx ON public.login_qr_tokens (token);

ALTER TABLE public.login_qr_tokens ENABLE ROW LEVEL SECURITY;

-- The desktop owner manages (creates/rotates) their own token row.
DROP POLICY IF EXISTS "login_qr_tokens_self_write" ON public.login_qr_tokens;
CREATE POLICY "login_qr_tokens_self_write" ON public.login_qr_tokens
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No general SELECT policy: a token's owner is looked up strictly through
-- find_login_qr_token() below (SECURITY DEFINER), never a raw table read —
-- otherwise any authenticated user could list every other agent's token by
-- querying the table directly instead of scanning their own desktop's QR.
DROP POLICY IF EXISTS "login_qr_tokens_no_direct_select" ON public.login_qr_tokens;

-- Resolves a scanned token to its owning user_id, but only when the caller
-- (the mobile-authenticated user) IS that owner — enforces "scan your own
-- desktop's QR only" at the database level, not just in client code.
CREATE OR REPLACE FUNCTION public.find_login_qr_token(p_token TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM public.login_qr_tokens
  WHERE token = p_token AND user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.find_login_qr_token(TEXT) TO authenticated;

-- Plugin Store entry so admin/manager can turn this on/off like every other
-- feature — defaults OFF. When off, desktop hides the QR card and mobile's
-- scan button stays unavailable.
INSERT INTO public.plugins (id, name, description) VALUES
  ('mobile-qr-checkin', 'Mobile QR Check-in', 'Shows a QR code on the desktop app that an agent can scan with their phone to start, pause, or resume their own Tracker session.')
ON CONFLICT (id) DO NOTHING;
