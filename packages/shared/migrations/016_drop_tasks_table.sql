-- Amber Flow — remove Tasks entirely
--
-- Tasks were removed from the app across desktop, mobile, and admin.
-- Appointments are now the only schedulable item: agents book them directly
-- from Home, admins see everything live in the Appointments tab, and the
-- alarm scheduler fires off appointment reminders/due times instead of task
-- ones. This drops the now-unused tasks table (and, via CASCADE, its RLS
-- policies, indexes, and any triggers defined on it).
--
-- Irreversible — all existing task rows/history are permanently deleted.
-- Run only once the app-side changes (this migration's accompanying commit)
-- are deployed, since older app builds still reading/writing `tasks` would
-- break immediately after this runs.

DROP TABLE IF EXISTS public.tasks CASCADE;
