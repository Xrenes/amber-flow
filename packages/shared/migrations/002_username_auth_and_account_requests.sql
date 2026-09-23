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
