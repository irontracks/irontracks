-- Feature flags globais com kill switch em tempo real
-- Consultado via /api/feature-flags com cache 30s no Upstash

CREATE TABLE IF NOT EXISTS public.feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  owner TEXT DEFAULT 'core',
  review_at DATE,
  metadata JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Seed com as flags existentes
INSERT INTO public.feature_flags (key, enabled, description, owner, review_at) VALUES
  ('featureTeamworkV2', false, 'Teamwork V2 system', 'core', '2026-03-31'),
  ('featureStoriesV2', false, 'Stories V2 system', 'core', '2026-03-31'),
  ('featureOfflineSyncV2', false, 'Offline Sync V2', 'core', '2026-03-31'),
  ('featureWeeklyReportCTA', false, 'Weekly Report CTA', 'core', '2026-03-31'),
  ('featuresKillSwitch', false, 'Global kill switch — disables ALL features when true', 'core', NULL)
ON CONFLICT (key) DO NOTHING;

-- RLS: anyone authenticated can read, only admin can write
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_flags_read" ON public.feature_flags
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "feature_flags_admin_write" ON public.feature_flags
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Service role full access
GRANT ALL ON public.feature_flags TO service_role;
GRANT SELECT ON public.feature_flags TO authenticated;
