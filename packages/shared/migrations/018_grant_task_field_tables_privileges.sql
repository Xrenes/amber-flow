-- Amber Flow — fix missing table grants on task_field_options/task_field_config
--
-- Both tables had correct RLS policies (read-all, admin/manager write) but
-- were missing the base GRANT SELECT/INSERT/UPDATE/DELETE to anon/authenticated
-- that every other table in this schema has — a gap present since these
-- tables were first created (they predate the migrations/ folder, created
-- directly via the Supabase dashboard). Without the grant, Postgres blocks
-- the query before RLS is even evaluated, surfacing as a flat "permission
-- denied for table task_field_options" for every role, including real
-- admins/managers whose RLS check would otherwise pass. Confirmed and fixed
-- live via the Supabase MCP tools on 2026-09-30; this migration exists so a
-- fresh database setup doesn't hit the same gap.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_field_options TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_field_config TO anon, authenticated;
