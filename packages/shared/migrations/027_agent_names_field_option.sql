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
