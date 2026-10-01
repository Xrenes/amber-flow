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
