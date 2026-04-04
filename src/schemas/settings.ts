import { z } from 'zod'

export const UserSettingsSchema = z
  .object({
    // ── Profile fields (used for calorie accuracy & completeness) ──────────────
    biologicalSex: z.enum(['male', 'female', 'not_informed']).default('not_informed'),
    bodyWeightKg: z.number().positive().nullable().default(null),
    heightCm: z.number().positive().nullable().default(null),
    age: z.number().int().positive().nullable().default(null),
    phone: z.string().default(''),
    city: z.string().default(''),
    state: z.string().default(''),
    gym: z.string().default(''),
    trainingExperienceYears: z.number().nonnegative().nullable().default(null),
    trainingFrequencyPerWeek: z.number().int().min(1).max(7).nullable().default(null),
    fitnessLevel: z.enum(['beginner', 'intermediate', 'advanced', 'not_informed']).default('not_informed'),
    fitnessGoal: z.enum(['hypertrophy', 'weight_loss', 'strength', 'performance', 'health', 'not_informed']).default('not_informed'),
    // ── UI & App settings ──────────────────────────────────────────────────────
    units: z.enum(['kg', 'lb']).default('kg'),
    dashboardDensity: z.enum(['comfortable', 'compact']).default('comfortable'),
    uiMode: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
    moduleSocial: z.boolean().default(true),
    moduleCommunity: z.boolean().default(true),
    moduleMarketplace: z.boolean().default(true),
    promptPreWorkoutCheckin: z.boolean().default(true),
    promptPostWorkoutCheckin: z.boolean().default(true),
    showStoriesBar: z.boolean().default(true),
    showNewRecordsCard: z.boolean().default(true),
    showIronRank: z.boolean().default(true),
    showBadges: z.boolean().default(true),
    whatsNewLastSeenId: z.string().default(''),
    whatsNewLastSeenAt: z.number().default(0),
    whatsNewAutoOpen: z.boolean().default(true),
    whatsNewRemind24h: z.boolean().default(true),
    enableSounds: z.boolean().default(true),
    allowTeamInvites: z.boolean().default(true),
    allowSocialFollows: z.boolean().default(true),
    allowDirectMessages: z.boolean().default(true),
    notifyDirectMessages: z.boolean().default(true),
    notifyAppointments: z.boolean().default(true),
    notifySocialFollows: z.boolean().default(true),
    notifyFriendOnline: z.boolean().default(true),
    notifyFriendWorkoutEvents: z.boolean().default(true),
    notifyFriendPRs: z.boolean().default(true),
    notifyFriendStreaks: z.boolean().default(true),
    notifyFriendGoals: z.boolean().default(true),
    soundVolume: z.number().min(0).max(100).default(100),
    inAppToasts: z.boolean().default(true),
    notificationPermissionPrompt: z.boolean().default(true),
    restTimerNotify: z.boolean().default(true),
    restTimerVibrate: z.boolean().default(true),
    restTimerRepeatAlarm: z.boolean().default(true),
    restTimerRepeatIntervalMs: z.number().default(1500),
    restTimerRepeatMaxSeconds: z.number().default(180),
    restTimerRepeatMaxCount: z.number().default(60),
    restTimerContinuousAlarm: z.boolean().default(false),
    restTimerTickCountdown: z.boolean().default(true),
    restTimerAutoStart: z.boolean().default(false),
    restTimerDefaultSeconds: z.number().default(90),
    autoRestTimerWhenMissing: z.boolean().default(false),
    programTitleStartDay: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']).default('monday'),
    featuresKillSwitch: z.boolean().default(false),
    featureTeamworkV2: z.boolean().default(false),
    featureStoriesV2: z.boolean().default(false),
    featureOfflineSyncV2: z.boolean().default(false),
    requireBiometricsOnStartup: z.boolean().default(false),
    // ── Integrations ──────────────────────────────────────────────────────────
    appleHealthSync: z.boolean().default(false),
  })
  .passthrough()

export type UserSettings = z.infer<typeof UserSettingsSchema>

export const DEFAULT_USER_SETTINGS = UserSettingsSchema.parse({}) as UserSettings

/**
 * Returns a 0–100 profile completeness score based on how many
 * important profile fields the user has filled in.
 * Calorie-impacting fields are weighted higher.
 */
export function getProfileCompletenessScore(settings: UserSettings | null | undefined): {
  score: number
  missingFields: string[]
  isComplete: boolean
} {
  if (!settings) return { score: 0, missingFields: [], isComplete: false }

  const checks: Array<{ label: string; filled: boolean; weight: number }> = [
    { label: 'Sexo biológico', filled: settings.biologicalSex !== 'not_informed', weight: 15 },
    { label: 'Peso corporal', filled: settings.bodyWeightKg != null && settings.bodyWeightKg > 0, weight: 20 },
    { label: 'Altura', filled: settings.heightCm != null && settings.heightCm > 0, weight: 15 },
    { label: 'Idade', filled: settings.age != null && settings.age > 0, weight: 10 },
    { label: 'Nível de condicionamento', filled: settings.fitnessLevel !== 'not_informed', weight: 10 },
    { label: 'Objetivo principal', filled: settings.fitnessGoal !== 'not_informed', weight: 10 },
    { label: 'Frequência semanal', filled: settings.trainingFrequencyPerWeek != null, weight: 10 },
    { label: 'Academia', filled: String(settings.gym || '').trim().length > 0, weight: 5 },
    { label: 'Cidade', filled: String(settings.city || '').trim().length > 0, weight: 5 },
  ]

  const totalWeight = checks.reduce((a, c) => a + c.weight, 0)
  const earnedWeight = checks.filter(c => c.filled).reduce((a, c) => a + c.weight, 0)
  const score = Math.round((earnedWeight / totalWeight) * 100)
  const missingFields = checks.filter(c => !c.filled).map(c => c.label)
  const isComplete = score >= 90

  return { score, missingFields, isComplete }
}
