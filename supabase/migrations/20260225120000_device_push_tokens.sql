-- Migration: device_push_tokens
-- Stores APNs (iOS) and FCM (Android) device tokens for push notification delivery.
-- Apply in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS device_push_tokens (
  token        TEXT NOT NULL,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL DEFAULT 'ios' CHECK (platform IN ('ios', 'android', 'web')),
  device_id    TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (token)
);

-- RLS
ALTER TABLE device_push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own tokens
DROP POLICY IF EXISTS "users_own_tokens" ON device_push_tokens;
CREATE POLICY "users_own_tokens" ON device_push_tokens
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_device_push_tokens_user_id
  ON device_push_tokens (user_id, platform);

CREATE INDEX IF NOT EXISTS idx_device_push_tokens_platform
  ON device_push_tokens (platform);
