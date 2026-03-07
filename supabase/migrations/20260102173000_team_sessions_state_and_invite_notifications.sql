ALTER TABLE public.team_sessions
  ADD COLUMN IF NOT EXISTS workout_state jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.team_sessions_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS team_sessions_set_updated_at ON public.team_sessions;
CREATE TRIGGER team_sessions_set_updated_at
BEFORE UPDATE ON public.team_sessions
FOR EACH ROW
EXECUTE FUNCTION public.team_sessions_set_updated_at();

CREATE OR REPLACE FUNCTION public.invites_create_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  sender_name text;
  workout_title text;
BEGIN
  IF NEW.to_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.status, 'pending') <> 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.display_name, '')
  INTO sender_name
  FROM public.profiles p
  WHERE p.id = NEW.from_uid;

  workout_title := COALESCE(NEW.workout_data->>'title', NEW.workout_data->>'name', 'Treino');

  INSERT INTO public.notifications(user_id, title, message, type)
  VALUES (
    NEW.to_uid,
    CASE
      WHEN sender_name <> '' THEN ('Convite de ' || sender_name)
      ELSE 'Convite de treino'
    END,
    'Convite para treinar: ' || workout_title,
    'invite'
  );

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS invites_create_notification ON public.invites;
CREATE TRIGGER invites_create_notification
AFTER INSERT ON public.invites
FOR EACH ROW
EXECUTE FUNCTION public.invites_create_notification();

