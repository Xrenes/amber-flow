-- Amber Flow — migration 012 never actually ran against the live database
--
-- Same gap as 021 (see that file's comment): re-applies 012's content
-- (login_qr_tokens table + find_login_qr_token() RPC + the
-- 'mobile-qr-checkin' Plugin Store entry), with the missing GRANT this
-- pattern kept hitting added explicitly this time.
CREATE TABLE IF NOT EXISTS public.login_qr_tokens (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS login_qr_tokens_token_idx ON public.login_qr_tokens (token);

ALTER TABLE public.login_qr_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "login_qr_tokens_self_write" ON public.login_qr_tokens;
CREATE POLICY "login_qr_tokens_self_write" ON public.login_qr_tokens
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "login_qr_tokens_no_direct_select" ON public.login_qr_tokens;

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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.login_qr_tokens TO authenticated;

INSERT INTO public.plugins (id, name, description) VALUES
  ('mobile-qr-checkin', 'Mobile QR Check-in', 'Shows a QR code on the desktop app that an agent can scan with their phone to start, pause, or resume their own Tracker session.')
ON CONFLICT (id) DO NOTHING;
