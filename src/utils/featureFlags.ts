export const FEATURE_KEYS = {
  teamworkV2: 'featureTeamworkV2',
  storiesV2: 'featureStoriesV2',
  offlineSyncV2: 'featureOfflineSyncV2',
  weeklyReportCTA: 'featureWeeklyReportCTA',
}

export const FEATURE_META = {
  teamworkV2: { key: FEATURE_KEYS.teamworkV2, owner: 'core', review_at: '2026-03-31' },
  storiesV2: { key: FEATURE_KEYS.storiesV2, owner: 'core', review_at: '2026-03-31' },
  offlineSyncV2: { key: FEATURE_KEYS.offlineSyncV2, owner: 'core', review_at: '2026-03-31' },
  weeklyReportCTA: { key: FEATURE_KEYS.weeklyReportCTA, owner: 'core', review_at: '2026-03-31' },
}

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v)

export const isKillSwitchOn = (settings) => {
  const s = isObject(settings) ? settings : {}
  return s.featuresKillSwitch === true
}

export const isFeatureEnabled = (settings, key) => {
  if (isKillSwitchOn(settings)) return false
  const s = isObject(settings) ? settings : {}
  return s?.[key] === true
}

export const listFeatureFlags = () => {
  return Object.entries(FEATURE_META).map(([name, meta]) => ({ name, ...meta }))
}
