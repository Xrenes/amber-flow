-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — Goal rules scoped to an agent NAME, not just a login
--
-- Appointments and tracked time are now attributed by agent_name (the
-- Field Options Agent list), not by who's signed in, so a per-agent goal
-- override needs to be able to target an agent who has no login too (e.g.
-- Tawsif, Shovon). agent_goals.user_id alone can't express that. This adds
-- agent_goals.agent_name as a second, mutually-exclusive way to scope a
-- rule: user_id (a login) OR agent_name (a plain name) OR neither (global).
-- Run this in: Supabase Dashboard → SQL Editor → New Query. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.agent_goals ADD COLUMN IF NOT EXISTS agent_name TEXT;

-- A row can't scope to both a login AND a plain name at once — pick one.
ALTER TABLE public.agent_goals DROP CONSTRAINT IF EXISTS agent_goals_scope_check;
ALTER TABLE public.agent_goals
  ADD CONSTRAINT agent_goals_scope_check CHECK (user_id IS NULL OR agent_name IS NULL);

-- The old uniqueness index only covered (user_id, campaign_name); replace it
-- with one that also folds in agent_name, so one rule per
-- (login-or-name, campaign) combination, including the global row.
DROP INDEX IF EXISTS public.agent_goals_scope_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS agent_goals_scope_uidx ON public.agent_goals (
  COALESCE(user_id::text, lower(agent_name), ''),
  COALESCE(campaign_name, '')
);

CREATE INDEX IF NOT EXISTS agent_goals_agent_name_idx ON public.agent_goals (lower(agent_name));
