BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_invite_whitelist_v2() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.admin_emails a WHERE a.email = lower(COALESCE(NEW.email,''))) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.access_requests ar
    WHERE lower(ar.email) = lower(COALESCE(NEW.email,''))
      AND ar.status IN ('pending', 'accepted')
  ) THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.students s WHERE lower(s.email) = lower(NEW.email))
     AND NOT EXISTS (SELECT 1 FROM public.teachers t WHERE lower(t.email) = lower(NEW.email)) THEN
    RAISE EXCEPTION 'Acesso Negado: Este email não foi cadastrado.';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

