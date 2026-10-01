-- Amber Flow — turn on live sync + close security gaps (full-check, 2026-10-01)
-- Run in: Supabase Dashboard → SQL Editor. Safe to run more than once.

-- 1) LIVE SYNC ──────────────────────────────────────────────────────────────
-- The apps subscribe to changes on these tables (a new appointment showing
-- up in Admin without Refresh, desktop ↔ mobile staying in step, plugin
-- toggles, presence dots), but none of them were in the supabase_realtime
-- publication, so no change events were ever sent. RLS still applies to
-- what each user receives.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['appointments', 'activity_logs', 'time_sessions',
                           'plugins', 'presence', 'agent_goals', 'app_settings']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- 2) NO SELF-PROMOTION ──────────────────────────────────────────────────────
-- profiles_own was FOR ALL with no WITH CHECK, so any signed-in agent could
-- run `update profiles set role = 'admin' where id = auth.uid()` from the
-- API and become an admin. The apps only ever read profiles and insert
-- their own row (ensureProfile), so split it: read/insert/update own row,
-- but the role can't change and a self-created row can only be an agent.
-- (get_my_role() reads the role as it was before the update.)
DROP POLICY IF EXISTS "profiles_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (id = auth.uid() AND COALESCE(role, 'agent') = 'agent');

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = get_my_role());

-- 3) SUMMARY VIEWS ──────────────────────────────────────────────────────────
-- Both views ran with their creator's rights, so any signed-in agent could
-- read every agent's appointment counts and worked hours. Make them respect
-- the caller's RLS like the tables do. (Neither is used by the apps.)
ALTER VIEW IF EXISTS public.appointment_summary SET (security_invoker = true);
ALTER VIEW IF EXISTS public.daily_work_summary SET (security_invoker = true);

-- 4) TRIGGER-ONLY FUNCTIONS ─────────────────────────────────────────────────
-- These only make sense as triggers; nobody should call them over the API.
-- (get_my_role and find_login_qr_token stay callable — policies and the
-- mobile QR login need them.)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated, public;
