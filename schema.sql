-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — Supabase Database Schema
-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. PROFILES (extends auth.users with role + telegram) ─────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL DEFAULT '',
  telegram_chat_id TEXT,
  role             TEXT NOT NULL DEFAULT 'agent'
                   CHECK (role IN ('admin', 'manager', 'agent')),
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'inactive')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile row whenever a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, telegram_chat_id, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.raw_user_meta_data->>'telegram_chat_id',
    'agent'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ── 2. APPOINTMENTS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_name     TEXT NOT NULL DEFAULT '',
  title            TEXT NOT NULL,
  description      TEXT,
  scheduled_time   TIMESTAMPTZ NOT NULL,
  reminder_minutes INT NOT NULL DEFAULT 15,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'completed', 'missed')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. TIME SESSIONS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.time_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_name     TEXT NOT NULL DEFAULT 'General',
  start_time       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time         TIMESTAMPTZ,
  duration_seconds INT,
  status           TEXT NOT NULL DEFAULT 'running'
                   CHECK (status IN ('running', 'paused', 'completed')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. ACTIVITY LOGS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type      TEXT NOT NULL,
  -- e.g. START_TRACKER | STOP_TRACKER | PAUSE_TRACKER |
  --      CREATE_APPOINTMENT | UPDATE_APPOINTMENT | COMPLETE_APPOINTMENT
  reference_id     UUID,   -- appointment_id or session_id
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. NOTIFICATIONS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message          TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'sent', 'failed')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

-- Profiles: own row full access; admin/manager can view all
-- NOTE: use a SECURITY DEFINER function to avoid infinite recursion
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_own"            ON public.profiles;
DROP POLICY IF EXISTS "profiles_manager_view"   ON public.profiles;
CREATE POLICY "profiles_own" ON public.profiles
  FOR ALL USING (auth.uid() = id);
CREATE POLICY "profiles_manager_view" ON public.profiles
  FOR SELECT USING (public.get_my_role() IN ('admin', 'manager'));

-- Appointments: own rows + manager/admin can view all
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "appt_own"            ON public.appointments;
DROP POLICY IF EXISTS "appt_manager_view"   ON public.appointments;
CREATE POLICY "appt_own" ON public.appointments
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "appt_manager_view" ON public.appointments
  FOR SELECT USING (public.get_my_role() IN ('admin', 'manager'));

-- Time sessions: own rows + manager/admin can view all
ALTER TABLE public.time_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sessions_own"            ON public.time_sessions;
DROP POLICY IF EXISTS "sessions_manager_view"   ON public.time_sessions;
CREATE POLICY "sessions_own" ON public.time_sessions
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "sessions_manager_view" ON public.time_sessions
  FOR SELECT USING (public.get_my_role() IN ('admin', 'manager'));

-- Activity logs: own rows + manager/admin can view all
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "logs_own"            ON public.activity_logs;
DROP POLICY IF EXISTS "logs_manager_view"   ON public.activity_logs;
CREATE POLICY "logs_own" ON public.activity_logs
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "logs_manager_view" ON public.activity_logs
  FOR SELECT USING (public.get_my_role() IN ('admin', 'manager'));

-- Notifications: own rows only
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifs_own" ON public.notifications;
CREATE POLICY "notifs_own" ON public.notifications
  FOR ALL USING (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES for performance
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_appointments_user   ON public.appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_time   ON public.appointments(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_sessions_user       ON public.time_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status     ON public.time_sessions(status);
CREATE INDEX IF NOT EXISTS idx_logs_user           ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_action         ON public.activity_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_logs_created        ON public.activity_logs(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- REPORTING VIEWS
-- ═══════════════════════════════════════════════════════════════════════════

-- Daily work summary per agent
CREATE OR REPLACE VIEW public.daily_work_summary AS
SELECT
  p.name,
  p.role,
  DATE(s.start_time) AS work_date,
  COUNT(s.id)        AS sessions,
  COALESCE(SUM(s.duration_seconds), 0) AS total_seconds
FROM public.time_sessions s
JOIN public.profiles p ON p.id = s.user_id
WHERE s.status = 'completed'
GROUP BY p.name, p.role, DATE(s.start_time);

-- Appointment summary per agent
CREATE OR REPLACE VIEW public.appointment_summary AS
SELECT
  p.name,
  p.role,
  DATE(a.scheduled_time) AS appt_date,
  COUNT(a.id) FILTER (WHERE a.status = 'pending')   AS pending,
  COUNT(a.id) FILTER (WHERE a.status = 'completed') AS completed,
  COUNT(a.id) FILTER (WHERE a.status = 'missed')    AS missed,
  COUNT(a.id) AS total
FROM public.appointments a
JOIN public.profiles p ON p.id = a.user_id
GROUP BY p.name, p.role, DATE(a.scheduled_time);

-- ═══════════════════════════════════════════════════════════════════════════
-- TASKS TABLE  (synced from localStorage by app.js)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.tasks (
  id               TEXT PRIMARY KEY,          -- client-generated uid
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title            TEXT NOT NULL DEFAULT '',
  description      TEXT,
  date             TEXT NOT NULL,             -- YYYY-MM-DD
  time             TEXT NOT NULL,             -- HH:MM
  reminder_minutes INT  NOT NULL DEFAULT 60,
  completed        BOOLEAN NOT NULL DEFAULT FALSE,
  lead_status      TEXT CHECK (lead_status IN ('S', 'NS', 'C')),
  timezone         TEXT,                              -- IANA timezone, e.g. 'America/New_York'
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own tasks
CREATE POLICY "tasks_self_all" ON public.tasks
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admins and managers can read all tasks
CREATE POLICY "tasks_manager_view" ON public.tasks
  FOR SELECT USING (get_my_role() IN ('admin', 'manager'));

GRANT ALL ON public.tasks TO authenticated;
GRANT SELECT ON public.tasks TO service_role;
