-- Migration: normalize_access_request_status
-- Normalizes stale 'accepted' rows to 'approved' so there is a single canonical
-- approved state. The application code uses 'approved' everywhere going forward.

UPDATE public.access_requests
   SET status     = 'approved',
       updated_at = NOW()
 WHERE status = 'accepted';
