-- Amber Flow — add missing timezone/account_name columns to appointments
--
-- The live appointments table never had `timezone` or `account_name` added
-- despite the app (upsertAppointments, database.types.ts) always including
-- them in every insert/update payload — the migration that was supposed to
-- add these (part of the original 001/007-era work, predating the
-- migrations/ folder) apparently never actually ran against this database.
-- PostgREST rejects an insert/update referencing a column that doesn't
-- exist, so EVERY appointment create/update/complete/miss has been
-- silently failing ever since: the client's optimistic local state update
-- made the UI look like it worked, and insertActivityLog (a separate,
-- schema-flexible jsonb write) succeeded right after, masking the failure
-- completely. Confirmed via direct inspection of the live schema and a
-- test insert through the Supabase MCP connection on 2026-09-30.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS timezone TEXT,
  ADD COLUMN IF NOT EXISTS account_name TEXT;
