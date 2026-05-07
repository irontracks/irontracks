-- phone_verifications
-- Stores OTP codes for WhatsApp phone verification during user registration.

CREATE TABLE public.phone_verifications (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         TEXT        NOT NULL,  -- normalized E.164 without "+": 5511999999999
  otp_code      TEXT        NOT NULL,
  verify_token  TEXT,                  -- UUID returned after successful verification (used once)
  verified      BOOLEAN     NOT NULL DEFAULT false,
  attempts      INT         NOT NULL DEFAULT 0,
  expires_at    TIMESTAMPTZ NOT NULL,
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX phone_verifications_phone_idx  ON public.phone_verifications(phone);
CREATE INDEX phone_verifications_token_idx  ON public.phone_verifications(verify_token) WHERE verify_token IS NOT NULL;

ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;
-- Only service role (cron + webhook routes) accesses this table.
-- No authenticated policy needed — all operations via admin client.

-- Add phone_verified flag to access_requests so admin can see it in the panel.
ALTER TABLE public.access_requests
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT false;
