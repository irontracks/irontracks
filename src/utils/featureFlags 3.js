export const FEATURE_KEYS = {
  teamworkV2: 'featureTeamworkV2',
  storiesV2: 'featureStoriesV2',
  weeklyReportCTA: 'featureWeeklyReportCTA',
  offlineSyncV2: 'featureOfflineSyncV2',
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
