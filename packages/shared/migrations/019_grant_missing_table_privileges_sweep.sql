-- Amber Flow — fix missing table grants across the schema (full sweep)
--
-- Migration 018 fixed task_field_options/task_field_config. A full audit of
-- every table's grants (2026-09-30, via the Supabase MCP connection) found
-- the same gap on several more tables — all created directly via the
-- Supabase dashboard before the migrations/ folder existed, all with
-- correct RLS policies but no base GRANT to anon/authenticated:
--   - account_requests (Account Requests tab)
--   - agent_goals (Goal Attainment)
--   - evaluation_criteria, evaluation_scores, evaluations (Evaluations)
--   - plugins (Plugin Store)
--   - presence (idle-status plugin)
-- Each was silently "permission denied" for every user, admin or not, the
-- same way task_field_options was. Confirmed and fixed live via the
-- Supabase MCP tools; this migration exists so a fresh database setup
-- doesn't hit the same gap.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_requests TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_goals TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluation_criteria TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluation_scores TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluations TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plugins TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.presence TO anon, authenticated;
