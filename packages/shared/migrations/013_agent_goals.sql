-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — Agent Goals (daily appointment/show targets + attainment)
-- Run this in: Supabase Dashboard → SQL Editor → New Query (after 012_*.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- One row = one goal rule. user_id/campaign_name are both nullable so a
-- single table covers global, per-campaign, and per-agent goals without
-- three separate tables. Resolution order (most specific wins), handled in
-- application code, not SQL: agent+campaign > agent-only > campaign-only >
-- global (user_id IS NULL AND campaign_name IS NULL). Matches the "DialForce"
-- sheet's Tracker Setup concept (Daily Appointment Goal / Daily Show Goal),
-- extended to support per-agent and per-campaign overrides per the plan to
-- add those next.
CREATE TABLE IF NOT EXISTS public.agent_goals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_name         TEXT,
  daily_appointment_goal INTEGER NOT NULL DEFAULT 3 CHECK (daily_appointment_goal >= 0),
  daily_show_goal        INTEGER NOT NULL DEFAULT 2 CHECK (daily_show_goal >= 0),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one rule per (user_id, campaign_name) combination, including the
-- global row where both are NULL. Postgres treats NULLs as distinct for
-- uniqueness by default, but a single global row and a single row per
-- agent/campaign pair is exactly what's wanted, so plain UNIQUE works here.
CREATE UNIQUE INDEX IF NOT EXISTS agent_goals_scope_uidx
  ON public.agent_goals (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'), COALESCE(campaign_name, ''));

CREATE INDEX IF NOT EXISTS agent_goals_user_idx ON public.agent_goals (user_id);
CREATE INDEX IF NOT EXISTS agent_goals_campaign_idx ON public.agent_goals (campaign_name);

ALTER TABLE public.agent_goals ENABLE ROW LEVEL SECURITY;

-- Every signed-in user can read goals (agents need to see their own targets
-- and status, same "no silent tracking" principle as the Plugin Store).
DROP POLICY IF EXISTS "agent_goals_read_all" ON public.agent_goals;
CREATE POLICY "agent_goals_read_all" ON public.agent_goals
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "agent_goals_admin_write" ON public.agent_goals;
CREATE POLICY "agent_goals_admin_write" ON public.agent_goals
  FOR ALL USING (get_my_role() IN ('admin', 'manager'))
  WITH CHECK (get_my_role() IN ('admin', 'manager'));

-- Seed the global default goal row (3 appointments / 2 shows per day),
-- matching the sheet's Tracker Setup defaults, so attainment calculations
-- have a fallback immediately without requiring admin to configure anything
-- first.
INSERT INTO public.agent_goals (user_id, campaign_name, daily_appointment_goal, daily_show_goal)
VALUES (NULL, NULL, 3, 2)
ON CONFLICT DO NOTHING;
