-- Tighten RLS on access_requests to prevent privilege escalation via anon key.
--
-- Problem: the existing "Allow public insert" policy uses WITH CHECK (true),
-- which lets any anon-key holder (the key is public in the app bundle) insert
-- a row with status='approved'. The handle_new_user trigger then auto-approves
-- any signup whose email matches an 'approved' row, turning the INSERT into a
-- privilege escalation — an attacker becomes a teacher without admin review.
--
-- Fix: restrict WITH CHECK to status='pending'. /api/access-request/create
-- already forces status='pending' (route.ts:115), so no application change
-- is needed. Admin approvals continue via the approve_access_request RPC
-- running as service_role, which bypasses RLS.
--
-- Also versions the RLS state that was set directly in production but never
-- committed as a migration — so new Supabase branches inherit the protection.

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public insert to access_requests" ON public.access_requests;
CREATE POLICY "Allow public insert to access_requests"
  ON public.access_requests
  FOR INSERT
  TO public
  WITH CHECK (status = 'pending');

DROP POLICY IF EXISTS "Service Role Full Access" ON public.access_requests;
CREATE POLICY "Service Role Full Access"
  ON public.access_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
