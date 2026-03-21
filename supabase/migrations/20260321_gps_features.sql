-- GPS Features: gyms, check-ins, cardio tracks, location settings
-- Migration: 20260321_gps_features

-- =========================================
-- 1. User Gyms (saved gym locations)
-- =========================================
CREATE TABLE IF NOT EXISTS user_gyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius_meters INT DEFAULT 100 CHECK (radius_meters BETWEEN 20 AND 500),
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE INDEX idx_user_gyms_user ON user_gyms(user_id);

ALTER TABLE user_gyms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own gyms"
  ON user_gyms FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =========================================
-- 2. Gym Check-ins
-- =========================================
CREATE TABLE IF NOT EXISTS gym_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gym_id UUID REFERENCES user_gyms(id) ON DELETE SET NULL,
  workout_id UUID,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  checked_in_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_gym_checkins_user ON gym_checkins(user_id);
CREATE INDEX idx_gym_checkins_gym ON gym_checkins(gym_id);
CREATE INDEX idx_gym_checkins_date ON gym_checkins(user_id, checked_in_at DESC);

ALTER TABLE gym_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own checkins"
  ON gym_checkins FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =========================================
-- 3. Cardio GPS Tracks
-- =========================================
CREATE TABLE IF NOT EXISTS cardio_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_id UUID,
  distance_meters DOUBLE PRECISION DEFAULT 0,
  duration_seconds INT DEFAULT 0,
  avg_pace_min_km DOUBLE PRECISION,
  max_speed_kmh DOUBLE PRECISION,
  calories_estimated INT DEFAULT 0,
  route JSONB DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cardio_tracks_user ON cardio_tracks(user_id);
CREATE INDEX idx_cardio_tracks_date ON cardio_tracks(user_id, created_at DESC);

ALTER TABLE cardio_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own tracks"
  ON cardio_tracks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =========================================
-- 4. User Location Settings (opt-in)
-- =========================================
CREATE TABLE IF NOT EXISTS user_location_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  gps_enabled BOOLEAN DEFAULT false,
  auto_checkin BOOLEAN DEFAULT false,
  share_gym_presence BOOLEAN DEFAULT false,
  show_on_gym_leaderboard BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_location_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own location settings"
  ON user_location_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
