-- Strengthen admin detection to include master email fallback
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND (p.role = 'admin' OR lower(p.email) = lower('djmkapple@gmail.com'))
  );
$$;

