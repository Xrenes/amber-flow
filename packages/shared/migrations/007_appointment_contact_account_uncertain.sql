-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — Appointment Contact Type / Account fields + Uncertain outcome
-- Run this in: Supabase Dashboard → SQL Editor → New Query (after 000_*.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- New appointment fields, mirroring tasks' account_name: contact_type and
-- account_name are picked from task_field_options (shared with Tasks' Account
-- field, since it's the same real-world account) or free-typed, per the
-- field's mode in task_field_config.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS contact_type TEXT,
  ADD COLUMN IF NOT EXISTS account_name TEXT;

-- Widen task_field_options/task_field_config to also cover 'contact_type'
-- (appointments' Account field reuses the existing 'account' pool).
ALTER TABLE public.task_field_options DROP CONSTRAINT IF EXISTS task_field_options_field_check;
ALTER TABLE public.task_field_options
  ADD CONSTRAINT task_field_options_field_check CHECK (field IN ('account', 'campaign', 'contact_type'));

ALTER TABLE public.task_field_config DROP CONSTRAINT IF EXISTS task_field_config_field_check;
ALTER TABLE public.task_field_config
  ADD CONSTRAINT task_field_config_field_check CHECK (field IN ('account', 'campaign', 'contact_type'));

INSERT INTO public.task_field_config (field, mode) VALUES
  ('contact_type', 'dropdown')
ON CONFLICT (field) DO NOTHING;

-- Seed a starter set of contact types (admin can edit/remove from Admin Panel).
INSERT INTO public.task_field_options (field, value) VALUES
  ('contact_type', 'Broker'),
  ('contact_type', 'Buyer'),
  ('contact_type', 'Seller'),
  ('contact_type', 'Other')
ON CONFLICT (field, value) DO NOTHING;

-- Add 'uncertain' as a third appointment outcome alongside showed/no_show.
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_show_status_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_show_status_check CHECK (show_status IN ('showed', 'no_show', 'uncertain'));
