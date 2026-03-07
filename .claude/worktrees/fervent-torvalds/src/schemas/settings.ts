import { z } from 'zod'

export const UserSettingsSchema = z
  .object({
    units: z.enum(['kg', 'lb']).default('kg'),
    dashboardDensity: z.enum(['comfortable', 'compact']).default('comfortable'),
    uiMode: z.enum(['beginner', 'advanced']).default('beginner'),
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
    restTimerTickCountdown: z.boolean().default(true),
    restTimerDefaultSeconds: z.number().default(90),
    autoRestTimerWhenMissing: z.boolean().default(false),
    programTitleStartDay: z.enum(['monday', 'sunday']).default('monday'),
    featuresKillSwitch: z.boolean().default(false),
    featureTeamworkV2: z.boolean().default(false),
    featureStoriesV2: z.boolean().default(false),
    featureOfflineSyncV2: z.boolean().default(false),
  })
  .passthrough()

export type UserSettings = z.infer<typeof UserSettingsSchema>

export const DEFAULT_USER_SETTINGS = UserSettingsSchema.parse({}) as UserSettings

