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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_field_options TO anon, authenticated;

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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_field_config TO anon, authenticated;
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
  ('productivity-reports', 'Productivity Reports', 'Per-agent, per-date-range report of hours worked, tasks completed, and appointment outcomes.'),
  ('screen-activity', 'Phone Screen Activity', 'While a Tracker session is running, logs when an agent''s phone screen turns on/off (Android) or the app is backgrounded (iOS — a rough signal only).')
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.login_qr_tokens TO authenticated;

-- Plugin Store entry so admin/manager can turn this on/off like every other
-- feature — defaults OFF. When off, desktop hides the QR card and mobile's
-- scan button stays unavailable.
INSERT INTO public.plugins (id, name, description) VALUES
  ('mobile-qr-checkin', 'Mobile QR Check-in', 'Shows a QR code on the desktop app that an agent can scan with their phone to start, pause, or resume their own Tracker session.')
ON CONFLICT (id) DO NOTHING;

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

-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — App Settings (generic key/value config) + tracking sheet URL
-- Run this in: Supabase Dashboard → SQL Editor → New Query (after 013_*.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- Small generic key/value store for single-value admin config that doesn't
-- warrant its own table — starts with the external Google Sheet link admin
-- wants to open from the app (see "Open Tracking Sheet" in the Admin Panel),
-- reusable for any future one-off setting.
CREATE TABLE IF NOT EXISTS public.app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Every signed-in user can read settings (e.g. so any agent could see the
-- sheet link too, not just admin/manager, if ever exposed there).
DROP POLICY IF EXISTS "app_settings_read_all" ON public.app_settings;
CREATE POLICY "app_settings_read_all" ON public.app_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "app_settings_admin_write" ON public.app_settings;
CREATE POLICY "app_settings_admin_write" ON public.app_settings
  FOR ALL USING (get_my_role() IN ('admin', 'manager'))
  WITH CHECK (get_my_role() IN ('admin', 'manager'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO anon, authenticated;

-- Seed the tracking sheet URL from the DialForce sheet shared during setup —
-- admin can change it later from the Admin Panel without a code change.
INSERT INTO public.app_settings (key, value)
VALUES ('tracking_sheet_url', 'https://docs.google.com/spreadsheets/d/1i8AjI3ZgQZ55ROZ_rRIssaSXzZtljYT0zN3R9icsmMQ/edit')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — Appointments: replace Contact Type with Contact Name + Lead Status
-- Run this in: Supabase Dashboard → SQL Editor → New Query (after 014_*.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- contact_type (e.g. Broker/Buyer/Seller, picked from task_field_options)
-- is replaced by two new fields per explicit request:
--   - contact_name: the actual person's name (free text — who the agent is
--     meeting/calling, not a category).
--   - lead_status: same S/NS/C enum Tasks already use (public.tasks.
--     lead_status), so Appointments and Tasks share one lead-tracking
--     vocabulary instead of two different systems.
-- contact_type itself is dropped, not just superseded, per "replace...
-- entirely" — existing values are not migrated into either new column since
-- they're a different kind of data (a category, not a name or a lead
-- outcome) and would misrepresent real data if auto-copied.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS lead_status TEXT CHECK (lead_status IN ('S', 'NS', 'C'));

ALTER TABLE public.appointments DROP COLUMN IF EXISTS contact_type;

CREATE INDEX IF NOT EXISTS idx_appointments_lead_status ON public.appointments(lead_status);

-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — remove Tasks entirely
-- Run this in: Supabase Dashboard → SQL Editor → New Query (after 015_*.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- Tasks were removed from the app across desktop, mobile, and admin.
-- Appointments are now the only schedulable item: agents book them directly
-- from Home, admins see everything live in the Appointments tab, and the
-- alarm scheduler fires off appointment reminders/due times instead of task
-- ones. This drops the now-unused tasks table (and, via CASCADE, its RLS
-- policies, indexes, and any triggers defined on it).
--
-- Irreversible — all existing task rows/history are permanently deleted.
DROP TABLE IF EXISTS public.tasks CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — Project/Client Name becomes a dropdown; drop Contact Name +
-- Lead Status from Appointments entirely
-- Run this in: Supabase Dashboard → SQL Editor → New Query (after 016_*.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- Project / Client Name is now an admin-managed dropdown (like Account and
-- Campaign) instead of free text — widen task_field_options/task_field_config's
-- CHECK constraints (previously 'account'/'campaign' only) to include 'project'.
ALTER TABLE public.task_field_options DROP CONSTRAINT IF EXISTS task_field_options_field_check;
ALTER TABLE public.task_field_options ADD CONSTRAINT task_field_options_field_check
  CHECK (field IN ('account', 'campaign', 'project'));

ALTER TABLE public.task_field_config DROP CONSTRAINT IF EXISTS task_field_config_field_check;
ALTER TABLE public.task_field_config ADD CONSTRAINT task_field_config_field_check
  CHECK (field IN ('account', 'campaign', 'project'));

INSERT INTO public.task_field_config (field, mode) VALUES
  ('project', 'dropdown')
ON CONFLICT (field) DO NOTHING;

-- Contact Name and Lead Status removed from Appointments entirely (no
-- replacement) per explicit request. Irreversible — existing values are
-- permanently deleted.
ALTER TABLE public.appointments DROP COLUMN IF EXISTS contact_name;
ALTER TABLE public.appointments DROP COLUMN IF EXISTS lead_status;

-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — fix missing table grants on task_field_options/task_field_config
-- Run this in: Supabase Dashboard → SQL Editor → New Query (after 017_*.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- Both tables had correct RLS policies but were missing the base GRANT
-- SELECT/INSERT/UPDATE/DELETE to anon/authenticated that every other table
-- has — a gap since these tables were first created (predates the
-- migrations/ folder). Without the grant, Postgres blocks the query before
-- RLS is even evaluated ("permission denied for table task_field_options"
-- for every role, including real admins/managers). The GRANT statements are
-- also folded into this file's earlier task_field_options/task_field_config
-- section above so a fresh database setup doesn't hit the same gap; this
-- section exists for an existing database that already ran that section
-- before the fix.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_field_options TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_field_config TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — fix missing table grants across the schema (full sweep)
-- Run this in: Supabase Dashboard → SQL Editor → New Query (after 018_*.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- Same gap as task_field_options/task_field_config, found on a full audit
-- of every table's grants: account_requests, agent_goals, evaluation_criteria,
-- evaluation_scores, evaluations, plugins, presence — all had correct RLS
-- policies but no base GRANT to anon/authenticated, so every one of these
-- was silently "permission denied" for every user, admin or not.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_requests TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_goals TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluation_criteria TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluation_scores TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluations TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plugins TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.presence TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — add missing timezone/account_name columns to appointments
-- Run this in: Supabase Dashboard → SQL Editor → New Query (after 019_*.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- The live appointments table never had timezone/account_name added despite
-- the app always including them in every insert/update payload — every
-- appointment create/update/complete/miss was silently failing (PostgREST
-- rejects a payload referencing a nonexistent column) while the optimistic
-- local UI update and a separate activity-log write masked the failure.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS timezone TEXT,
  ADD COLUMN IF NOT EXISTS account_name TEXT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — re-run migrations 011/012/014 (never actually applied)
-- Run this in: Supabase Dashboard → SQL Editor → New Query (after 020_*.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- A full schema audit (2026-09-30, via the Supabase MCP connection) found
-- that migrations 011 (screen-activity plugin), 012 (login_qr_tokens table),
-- and 014 (app_settings table) were tracked as run but never actually
-- applied to the live database — all three of their CREATE TABLE/INSERT
-- statements are already folded into this file's earlier sections (now with
-- the missing GRANTs added too), so nothing further is needed here for a
-- FRESH database. This block exists only for an EXISTING database that
-- already ran everything up through 020 and needs the same catch-up:
INSERT INTO public.plugins (id, name, description) VALUES
  ('screen-activity', 'Phone Screen Activity', 'While a Tracker session is running, logs when an agent''s phone screen turns on/off (Android) or the app is backgrounded (iOS — a rough signal only).')
ON CONFLICT (id) DO NOTHING;

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
CREATE OR REPLACE FUNCTION public.find_login_qr_token(p_token TEXT)
RETURNS UUID LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT user_id FROM public.login_qr_tokens WHERE token = p_token AND user_id = auth.uid(); $$;
GRANT EXECUTE ON FUNCTION public.find_login_qr_token(TEXT) TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.login_qr_tokens TO authenticated;
INSERT INTO public.plugins (id, name, description) VALUES
  ('mobile-qr-checkin', 'Mobile QR Check-in', 'Shows a QR code on the desktop app that an agent can scan with their phone to start, pause, or resume their own Tracker session.')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_settings_read_all" ON public.app_settings;
CREATE POLICY "app_settings_read_all" ON public.app_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "app_settings_admin_write" ON public.app_settings;
CREATE POLICY "app_settings_admin_write" ON public.app_settings
  FOR ALL USING (get_my_role() IN ('admin', 'manager'))
  WITH CHECK (get_my_role() IN ('admin', 'manager'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO anon, authenticated;
INSERT INTO public.app_settings (key, value)
VALUES ('tracking_sheet_url', 'https://docs.google.com/spreadsheets/d/1i8AjI3ZgQZ55ROZ_rRIssaSXzZtljYT0zN3R9icsmMQ/edit')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 024_appointments_team_assignment_policies.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Amber Flow — let appointments be created/assigned for teammates
--
-- Migration 008 never ran on the live database, which still had the
-- original single policy: appt_own FOR ALL USING (user_id = auth.uid()).
-- The New Appointment modal's Agent dropdown lets anyone book an
-- appointment for a teammate, but that policy rejected every row whose
-- user_id wasn't the caller's own id ("new row violates row-level security
-- policy for table appointments"), so those appointments never saved and
-- never showed up in Reports or the Admin Appointments tab. 008 as written
-- also only relaxed UPDATE, so creating directly for a teammate would still
-- have failed.
--
-- New rules:
--   - read: own rows (admin/manager still see everything via appt_manager_view)
--   - create: for any real teammate (user_id must exist in profiles)
--   - update/complete/miss: own rows, or any row for admin/manager; the
--     (possibly reassigned) owner must still be a real teammate
--   - delete: own rows, or any row for admin/manager
--   - any signed-in user can read the team list, so agents' Agent dropdown
--     isn't empty

DROP POLICY IF EXISTS "profiles_team_directory_read" ON public.profiles;
CREATE POLICY "profiles_team_directory_read" ON public.profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "appt_own" ON public.appointments;
DROP POLICY IF EXISTS "appt_select_own" ON public.appointments;
DROP POLICY IF EXISTS "appt_insert_own" ON public.appointments;
DROP POLICY IF EXISTS "appt_update_own_or_reassign" ON public.appointments;
DROP POLICY IF EXISTS "appt_delete_own" ON public.appointments;
DROP POLICY IF EXISTS "appt_insert_team" ON public.appointments;
DROP POLICY IF EXISTS "appt_update_own_or_manager" ON public.appointments;
DROP POLICY IF EXISTS "appt_delete_own_or_manager" ON public.appointments;

CREATE POLICY "appt_select_own" ON public.appointments
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "appt_insert_team" ON public.appointments
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id)
  );

CREATE POLICY "appt_update_own_or_manager" ON public.appointments
  FOR UPDATE USING (user_id = auth.uid() OR get_my_role() IN ('admin', 'manager'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id));

CREATE POLICY "appt_delete_own_or_manager" ON public.appointments
  FOR DELETE USING (user_id = auth.uid() OR get_my_role() IN ('admin', 'manager'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 025_appointments_allow_uncertain_show_status.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Amber Flow — allow 'uncertain' show_status on appointments
--
-- The show_status part of migration 007 never ran on the live database, so
-- its check constraint still only allowed 'showed'/'no_show'. Ticking an
-- appointment done on Home completes it with show_status 'uncertain', which
-- the old constraint rejected ("violates check constraint
-- appointments_show_status_check"), so completions never saved.

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_show_status_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_show_status_check CHECK (show_status IN ('showed', 'no_show', 'uncertain'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 026_realtime_and_security_hardening.sql
-- ═══════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════
-- 027_agent_names_field_option.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Amber Flow — admin-managed agent names (for agents without a login yet)
--
-- Admin → Field Options gets an "Agent names" list (task_field_options,
-- field 'agent'). Those names appear in every Agent dropdown next to team
-- members who have accounts. An appointment booked for a name-only agent is
-- owned by whoever booked it (user_id must be a real account) and records
-- the chosen name in appointments.agent_name. Safe to run more than once.

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS agent_name TEXT;

ALTER TABLE public.task_field_options DROP CONSTRAINT IF EXISTS task_field_options_field_check;
ALTER TABLE public.task_field_options
  ADD CONSTRAINT task_field_options_field_check CHECK (field IN ('account', 'campaign', 'project', 'agent'));

ALTER TABLE public.task_field_config DROP CONSTRAINT IF EXISTS task_field_config_field_check;
ALTER TABLE public.task_field_config
  ADD CONSTRAINT task_field_config_field_check CHECK (field IN ('account', 'campaign', 'project', 'agent'));

INSERT INTO public.task_field_config (field, mode) VALUES ('agent', 'dropdown')
ON CONFLICT (field) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 028_agent_name_everywhere_and_shared_visibility.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Amber Flow — agent_name on time_sessions; appointments/time_sessions
-- readable by every signed-in user (Reports now shows everyone's work,
-- attributed by agent name, not scoped to "my own login").
--
-- Context: the Agent field everywhere (New Appointment, Time Tracker) is
-- now built ONLY from the admin-managed Agent list in Field Options
-- (task_field_options, field='agent') — never from team logins/display
-- names. A signed-in account is just "who is saving this row"; agent_name
-- is the separate, authoritative "who this is for" — unaffected by anyone
-- later renaming their display name.

-- 1) time_sessions gets the same agent_name column appointments already has.
ALTER TABLE public.time_sessions ADD COLUMN IF NOT EXISTS agent_name TEXT;

-- 2) Every signed-in user can read every appointment / time session, so
-- Reports (My Reports / mobile Reports) can show everyone's work by agent
-- name. Writes stay scoped to the row's own user_id (or admin/manager),
-- unchanged from before.
DROP POLICY IF EXISTS "appt_select_own" ON public.appointments;
DROP POLICY IF EXISTS "appt_manager_view" ON public.appointments;
DROP POLICY IF EXISTS "appt_select_all" ON public.appointments;
CREATE POLICY "appt_select_all" ON public.appointments
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "sessions_own" ON public.time_sessions;
DROP POLICY IF EXISTS "sessions_manager_view" ON public.time_sessions;
DROP POLICY IF EXISTS "sessions_select_all" ON public.time_sessions;
DROP POLICY IF EXISTS "sessions_write_own_or_manager" ON public.time_sessions;
CREATE POLICY "sessions_select_all" ON public.time_sessions
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "sessions_write_own_or_manager" ON public.time_sessions
  FOR ALL USING (user_id = auth.uid() OR get_my_role() IN ('admin', 'manager'))
  WITH CHECK (user_id = auth.uid() OR get_my_role() IN ('admin', 'manager'));

-- 3) Admin account deletion: let an admin/manager delete a profile row
-- (deleting the matching auth.users row is done via the admin-delete-user
-- Edge Function, which needs the service-role key). profiles.id cascades
-- from auth.users ON DELETE CASCADE, so this policy is really only hit if
-- an admin deletes the profile without the auth user existing anymore.
DROP POLICY IF EXISTS "profiles_admin_delete" ON public.profiles;
CREATE POLICY "profiles_admin_delete" ON public.profiles
  FOR DELETE USING (get_my_role() IN ('admin', 'manager'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 029_lock_appointment_booked_time.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Amber Flow — an appointment's booked time (created_at) never changes.
--
-- created_at is the "Booked" date shown in Reports and on every appointment
-- card. Edits, status changes and re-saves from any client must leave it as
-- it was when the appointment was first booked, so updates keep the old
-- value whatever they send. Safe to run more than once.

CREATE OR REPLACE FUNCTION public.keep_appointment_created_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_keep_created_at ON public.appointments;
CREATE TRIGGER appointments_keep_created_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.keep_appointment_created_at();

REVOKE EXECUTE ON FUNCTION public.keep_appointment_created_at() FROM anon, authenticated, public;

-- ═══════════════════════════════════════════════════════════════════════════
-- 030_agent_goals_by_name.sql
-- ═══════════════════════════════════════════════════════════════════════════

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
