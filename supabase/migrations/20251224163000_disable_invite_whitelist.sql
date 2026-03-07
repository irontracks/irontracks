DROP TRIGGER IF EXISTS t_enforce_invite_whitelist ON auth.users;
DROP FUNCTION IF EXISTS public.enforce_invite_whitelist();
