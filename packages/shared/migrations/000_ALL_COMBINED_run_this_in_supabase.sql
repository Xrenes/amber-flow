-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — Account / Campaign / Agent fields on tasks
-- Run this in: Supabase Dashboard → SQL Editor → New Query (after schema.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- New task fields:
--   agent_name    — always the real name of whoever created the task (auto-filled)
--   account_name  — free text or picked from task_field_options (field='account')
--   campaign_name — free text or picked from task_field_options (field='campaign')
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS agent_name    TEXT,
  ADD COLUMN IF NOT EXISTS account_name  TEXT,
  ADD COLUMN IF NOT EXISTS campaign_name TEXT;

-- ── Admin-managed dropdown options for Account / Campaign ──────────────────
-- Starts empty; admin adds values from the Admin Panel. Everyone can read
-- (needed to populate the dropdown), only admin/manager can write.
CREATE TABLE IF NOT EXISTS public.task_field_options (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field      TEXT NOT NULL CHECK (field IN ('account', 'campaign')),
  value      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (field, value)
);

ALTER TABLE public.task_field_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_field_options_read_all" ON public.task_field_options;
CREATE POLICY "task_field_options_read_all" ON public.task_field_options
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "task_field_options_admin_write" ON public.task_field_options;
CREATE POLICY "task_field_options_admin_write" ON public.task_field_options
  FOR ALL USING (get_my_role() IN ('admin', 'manager'))
  WITH CHECK (get_my_role() IN ('admin', 'manager'));

-- ── Per-field input mode: 'dropdown' (pick from task_field_options) or
--    'text' (free-typed). Admin toggles this per field from the Admin Panel.
CREATE TABLE IF NOT EXISTS public.task_field_config (
  field TEXT PRIMARY KEY CHECK (field IN ('account', 'campaign')),
  mode  TEXT NOT NULL DEFAULT 'dropdown' CHECK (mode IN ('dropdown', 'text'))
);

INSERT INTO public.task_field_config (field, mode) VALUES
  ('account', 'dropdown'),
  ('campaign', 'dropdown')
ON CONFLICT (field) DO NOTHING;

ALTER TABLE public.task_field_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_field_config_read_all" ON public.task_field_config;
CREATE POLICY "task_field_config_read_all" ON public.task_field_config
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "task_field_config_admin_write" ON public.task_field_config;
CREATE POLICY "task_field_config_admin_write" ON public.task_field_config
  FOR ALL USING (get_my_role() IN ('admin', 'manager'))
  WITH CHECK (get_my_role() IN ('admin', 'manager'));
-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — Username/password auth + admin-approved account requests
-- Run this in: Supabase Dashboard → SQL Editor → New Query (after 001_*.sql)
-- Replaces Telegram-chatId-based signup/login with a plain username, and
-- self-service "Create Account" with an admin-reviewed request queue.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- ── Account requests ─────────────────────────────────────────────────────
-- Submitted from the login screen's "Request Account" form (no auth
-- required — the requester doesn't have an account yet). Admin reviews
-- these in the Admin Panel; approving one creates the real profile/auth user.
CREATE TABLE IF NOT EXISTS public.account_requests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  contact    TEXT NOT NULL, -- email, phone, or other way to reach the requester
  note       TEXT,
  status     TEXT NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.account_requests ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated visitors on the login screen) can submit
-- a request, but only insert — no read/update/delete without being admin.
DROP POLICY IF EXISTS "account_requests_insert_anon" ON public.account_requests;
CREATE POLICY "account_requests_insert_anon" ON public.account_requests
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "account_requests_admin_all" ON public.account_requests;
CREATE POLICY "account_requests_admin_all" ON public.account_requests
  FOR ALL USING (get_my_role() IN ('admin', 'manager'))
  WITH CHECK (get_my_role() IN ('admin', 'manager'));
-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — Plugin store (Idle/Active status, Productivity Reports)
-- Run this in: Supabase Dashboard → SQL Editor → New Query (after 002_*.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Plugin registry ──────────────────────────────────────────────────────
-- One row per known plugin. `enabled` is a global on/off switch admin
-- controls from the Admin Panel's Plugin Store tab. New plugin ids are
-- seeded here (not dynamically discovered — this is a curated set of
-- built-in features presented as a "store", not a real plugin loader).
CREATE TABLE IF NOT EXISTS public.plugins (
  id          TEXT PRIMARY KEY, -- e.g. 'idle-status', 'productivity-reports'
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.plugins (id, name, description) VALUES
  ('idle-status', 'Idle/Active Status', 'Shows each agent as Active, Idle, or Away in real time, based on keyboard/mouse activity.'),
  ('productivity-reports', 'Productivity Reports', 'Per-agent, per-date-range report of hours worked, tasks completed, and appointment outcomes.')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.plugins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plugins_read_all" ON public.plugins;
CREATE POLICY "plugins_read_all" ON public.plugins
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "plugins_admin_write" ON public.plugins;
CREATE POLICY "plugins_admin_write" ON public.plugins
  FOR UPDATE USING (get_my_role() IN ('admin', 'manager'))
  WITH CHECK (get_my_role() IN ('admin', 'manager'));

-- ── Presence (backs the Idle/Active Status plugin) ──────────────────────
-- One row per user, upserted periodically by that user's own client while
-- the app is open and the plugin is enabled — visible to the agent (their
-- own status shows in the topbar) and to admin/manager (Admin Panel).
CREATE TABLE IF NOT EXISTS public.presence (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'idle', 'away')),
  last_active  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "presence_self_write" ON public.presence;
CREATE POLICY "presence_self_write" ON public.presence
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "presence_manager_view" ON public.presence;
CREATE POLICY "presence_manager_view" ON public.presence
  FOR SELECT USING (get_my_role() IN ('admin', 'manager'));
-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — Agent evaluations (admin-defined criteria, scored + noted)
-- Run this in: Supabase Dashboard → SQL Editor → New Query (after 003_*.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Admin-managed evaluation criteria ───────────────────────────────────
-- Starts empty; admin adds criteria from the Admin Panel (e.g.
-- "Communication", "Task Completion", "Reliability"). Read is open to
-- everyone so an agent viewing a shared evaluation can see criterion names.
CREATE TABLE IF NOT EXISTS public.evaluation_criteria (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.evaluation_criteria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evaluation_criteria_read_all" ON public.evaluation_criteria;
CREATE POLICY "evaluation_criteria_read_all" ON public.evaluation_criteria
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "evaluation_criteria_admin_write" ON public.evaluation_criteria;
CREATE POLICY "evaluation_criteria_admin_write" ON public.evaluation_criteria
  FOR ALL USING (get_my_role() IN ('admin', 'manager'))
  WITH CHECK (get_my_role() IN ('admin', 'manager'));

-- ── Evaluations ──────────────────────────────────────────────────────────
-- One row per evaluation event. `visible_to_agent` is admin-controlled per
-- evaluation — some can be shared with the evaluated agent, others kept
-- internal to admin/manager only.
CREATE TABLE IF NOT EXISTS public.evaluations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  evaluator_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  evaluation_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  notes            TEXT,
  visible_to_agent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

-- Admin/manager can do everything.
DROP POLICY IF EXISTS "evaluations_admin_all" ON public.evaluations;
CREATE POLICY "evaluations_admin_all" ON public.evaluations
  FOR ALL USING (get_my_role() IN ('admin', 'manager'))
  WITH CHECK (get_my_role() IN ('admin', 'manager'));

-- Agent can read only their own evaluations that were explicitly shared.
DROP POLICY IF EXISTS "evaluations_agent_view_shared" ON public.evaluations;
CREATE POLICY "evaluations_agent_view_shared" ON public.evaluations
  FOR SELECT USING (agent_id = auth.uid() AND visible_to_agent = true);

-- ── Evaluation scores ────────────────────────────────────────────────────
-- One row per criterion within an evaluation. `rating` is free-form for now
-- (recorded, not validated against a fixed scale) — a plain integer, admin
-- decides what scale to use when entering it.
CREATE TABLE IF NOT EXISTS public.evaluation_scores (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id  UUID NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  criterion_id   UUID NOT NULL REFERENCES public.evaluation_criteria(id) ON DELETE CASCADE,
  rating         INT,
  notes          TEXT,
  UNIQUE (evaluation_id, criterion_id)
);

ALTER TABLE public.evaluation_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evaluation_scores_admin_all" ON public.evaluation_scores;
CREATE POLICY "evaluation_scores_admin_all" ON public.evaluation_scores
  FOR ALL USING (get_my_role() IN ('admin', 'manager'))
  WITH CHECK (get_my_role() IN ('admin', 'manager'));

-- Agent can read scores that belong to an evaluation shared with them.
DROP POLICY IF EXISTS "evaluation_scores_agent_view_shared" ON public.evaluation_scores;
CREATE POLICY "evaluation_scores_agent_view_shared" ON public.evaluation_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.evaluations e
      WHERE e.id = evaluation_scores.evaluation_id
        AND e.agent_id = auth.uid()
        AND e.visible_to_agent = true
    )
  );

CREATE INDEX IF NOT EXISTS idx_evaluations_agent ON public.evaluations(agent_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_scores_eval ON public.evaluation_scores(evaluation_id);
-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — Appointment show/no-show outcome (BPO booking metric)
-- Run this in: Supabase Dashboard → SQL Editor → New Query (after 004_*.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- Separate from `status` (pending/completed/missed, the reminder lifecycle):
-- show_status specifically records whether the client showed up, captured
-- when an agent marks a pending appointment completed. NULL means not yet
-- recorded (e.g. still pending, or missed before any outcome was set).
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS show_status TEXT CHECK (show_status IN ('showed', 'no_show'));

CREATE INDEX IF NOT EXISTS idx_appointments_show_status ON public.appointments(show_status);
