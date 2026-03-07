
-- Create access_requests table
CREATE TABLE IF NOT EXISTS public.access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    full_name TEXT NOT NULL,
    birth_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public to insert (anyone can request access)
DROP POLICY IF EXISTS "Allow public insert to access_requests" ON public.access_requests;
CREATE POLICY "Allow public insert to access_requests"
ON public.access_requests
FOR INSERT
TO public
WITH CHECK (true);

-- Policy: Allow admins to select/update/delete
-- Assuming 'admins' table exists or profiles.role = 'admin'. 
-- Based on previous knowledge of this project, admins are usually checked via `is_admin()` function or similar, 
-- or simply checking if user is in `admins` table.
-- Let's check if `admins` table exists or `profiles.role`.
-- I'll use a generic policy that relies on the `postgres` role or authenticated users who are admins.
-- Actually, the backend API will use `service_role` (admin client) to fetch/update these requests, 
-- so RLS for `select/update` might not be strictly necessary for the API to work if I use `supabaseAdmin`.
-- However, for safety, I should define them.
-- Since I don't know the exact admin check implementation in SQL for this project, 
-- I will allow `service_role` full access and `authenticated` users nothing by default (except insert).
-- Wait, `public` role needs insert.

-- Policy: Service Role has full access (implicit, but good to note)

-- If we want to allow "Admins" to query via client-side (if AdminPanel uses client supabase), we need a policy.
-- But usually AdminPanel APIs use server-side logic.
-- I'll stick to: Public Insert. Service Role Full Access.
