-- Block login creation for cancelled teachers
CREATE OR REPLACE FUNCTION public.block_cancelled_teacher_login() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.teachers t WHERE lower(t.email) = lower(NEW.email) AND t.payment_status = 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Conta suspensa: entre em contato com o administrador.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_block_cancelled_teacher_login ON auth.users;
CREATE TRIGGER t_block_cancelled_teacher_login
BEFORE INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.block_cancelled_teacher_login();

