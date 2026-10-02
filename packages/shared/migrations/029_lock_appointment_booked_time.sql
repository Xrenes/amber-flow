-- Amber Flow — an appointment's booked time (created_at) never changes.
--
-- created_at is the "Booked" date shown in Reports and on every appointment
-- card. Edits, status changes and re-saves from any client must leave it as
-- it was when the appointment was first booked, so updates keep the old
-- value whatever they send. Safe to run more than once.

CREATE OR REPLACE FUNCTION public.keep_appointment_created_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_keep_created_at ON public.appointments;
CREATE TRIGGER appointments_keep_created_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.keep_appointment_created_at();

REVOKE EXECUTE ON FUNCTION public.keep_appointment_created_at() FROM anon, authenticated, public;
