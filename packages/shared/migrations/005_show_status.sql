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
