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
    /**
     * Fase da DIETA, escolhida no painel ⚙ Metas da nutrição — não confundir com
     * `fitnessGoal`, que é o objetivo de TREINO. São eixos independentes: dá para
     * treinar hipertrofia estando em cutting. Null = nunca escolheu, e aí a fase é
     * derivada do `fitnessGoal` (ver lib/nutrition/phase.ts) para não mudar a meta
     * de quem já usa o app.
     */
    nutritionPhase: z.enum(['CUT', 'MAINTAIN', 'BULK']).nullable().default(null),
    // ── UI & App settings ──────────────────────────────────────────────────────
    units: z.enum(['kg', 'lb']).default('kg'),
    dashboardDensity: z.enum(['comfortable', 'compact']).default('comfortable'),
    uiMode: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
    moduleSocial: z.boolean().default(true),
    moduleCommunity: z.boolean().default(true),
    promptPreWorkoutCheckin: z.boolean().default(true),
    promptPostWorkoutCheckin: z.boolean().default(true),
    // ── Carga automática (motor de auto-regulação) — beta fechado ──────────────
    // autoLoadBeta: liberado por perfil (via DB) — controla se a chavinha aparece.
    // Invisível por padrão; ligado só p/ perfis de teste. autoLoad: o on/off que o
    // usuário controla na chavinha do treino ativo (só efetivo se beta ligado).
    autoLoadBeta: z.boolean().default(false),
    autoLoad: z.boolean().default(false),
    // Deload por-exercício: chaves normalizadas (normalizeExerciseKey) dos exercícios
    // com o deload DESLIGADO. Ausente da lista = ligado (default). Com deload off o
    // motor de carga nunca reduz o peso — só mantém ou sobe. Substitui o modal manual
    // antigo: o botão do card virou um liga/desliga por exercício.
    autoLoadDeloadOff: z.array(z.string()).default([]),
    /**
     * Treinos com descarga DESLIGADA (chave = nome do treino normalizado).
     *
     * Descarga é decisão do TREINO, não do exercício: a fadiga que a justifica é
     * sistêmica, e aliviar um movimento só não descansa nada. Até ago/2026 o
     * controle era por exercício (`autoLoadDeloadOff`), o que obrigava a decidir
     * 8 vezes o que é uma decisão só — e, pior, a chave era o NOME do exercício:
     * desligar o Supino num treino desligava em todos os outros.
     *
     * `autoLoadDeloadOff` continua lido para não virar a chave de quem já tinha
     * exercício desligado (ver useWorkoutAutoload).
     */
    autoLoadDeloadOffWorkouts: z.array(z.string()).default([]),
    // ── Calculadora de anilhas ────────────────────────────────────────────────
    // Inventário real de anilhas do usuário: valor da anilha (kg, como string) →
    // quantidade de UNIDADES. Vazio = academia completa (DEFAULT_GYM_INVENTORY),
    // para não obrigar ninguém a cadastrar nada. Só quem treina em casa ajusta.
    // Consumido por utils/plates/plateInventory.ts.
    plateInventory: z.record(z.string(), z.number().int().nonnegative()).default({}),
    /** Peso da barra usada pelo usuário (kg). Base de toda decomposição. */
    barWeightKg: z.number().nonnegative().default(20),
    showStoriesBar: z.boolean().default(true),
    showNewRecordsCard: z.boolean().default(true),
    showIronRank: z.boolean().default(true),
    showBadges: z.boolean().default(true),
    whatsNewLastSeenId: z.string().default(''),
    whatsNewLastSeenAt: z.number().default(0),
    whatsNewAutoOpen: z.boolean().default(true),
    whatsNewRemind24h: z.boolean().default(true),
    // Janela do "Repetir por 24h": id do update e timestamp-limite até quando
    // ele deve reaparecer após o usuário fechar (em vez de sumir de vez).
    whatsNewRemindId: z.string().default(''),
    whatsNewRemindUntil: z.number().default(0),
    enableSounds: z.boolean().default(true),
    allowTeamInvites: z.boolean().default(true),
    allowSocialFollows: z.boolean().default(true),
    allowDirectMessages: z.boolean().default(true),
    // ── Notificações (push + in-app) ──────────────────────────────────────
    // Master switch: when false, NO push is delivered to the lock screen for
    // any type. In-app notifications still appear (the user may want to see
    // them on the bell menu without being interrupted on the lock screen).
    pushNotificationsEnabled: z.boolean().default(true),
    // "Não perturbar": nenhum push na janela [start, end) em horário de Brasília
    // (as notificações in-app seguem). Pushes críticos (cobrança/segurança) ignoram.
    quietHoursEnabled: z.boolean().default(false),
    quietHoursStart: z.number().int().min(0).max(23).default(22),
    quietHoursEnd: z.number().int().min(0).max(23).default(7),
    // Per-type toggles — apply to both in-app notifications and pushes
    notifyDirectMessages: z.boolean().default(true),
    notifyAppointments: z.boolean().default(true),
    notifyBroadcasts: z.boolean().default(true),
    notifySocialFollows: z.boolean().default(true),
    notifyFollowAccepted: z.boolean().default(true),
    notifyFriendOnline: z.boolean().default(true),
    notifyFriendWorkoutEvents: z.boolean().default(true),
    notifyFriendWorkoutStart: z.boolean().default(true),
    notifyFriendPRs: z.boolean().default(true),
    notifyFriendStreaks: z.boolean().default(true),
    notifyFriendGoals: z.boolean().default(true),
    notifyFriendComeback: z.boolean().default(true),
    notifyAchievements: z.boolean().default(true),
    notifyFriendWeeklyGoal: z.boolean().default(true),
    notifyStoryPosted: z.boolean().default(true),
    notifyStoryLikes: z.boolean().default(true),
    // Professor: avisar quando um aluno dele inicia um treino (pra poder assumir o controle).
    notifyStudentWorkoutStart: z.boolean().default(true),
    // Aluno: avisar quando o professor envia/monta um treino novo pra ele.
    notifyWorkoutAssigned: z.boolean().default(true),
    // Aluno: avisar quando o professor MEXE num treino que ele já tem. Separado
    // do "treino novo" de propósito: quem recebe treino toda semana pode querer
    // só o novo, e quem tem um treino fixo quer justamente saber do ajuste.
    notifyWorkoutUpdated: z.boolean().default(true),
    // Aluno: avisar quando o professor prescreve ou ajusta o plano alimentar.
    notifyDietPlan: z.boolean().default(true),
    notifyStoryReactions: z.boolean().default(true),
    notifyStoryComments: z.boolean().default(true),
    notifyMentions: z.boolean().default(true),
    notifyNearPR: z.boolean().default(true),
    notifyBirthday: z.boolean().default(true),
    notifyStreakAtRisk: z.boolean().default(true),
    notifyInactivity: z.boolean().default(true),
    notifyMorningBriefing: z.boolean().default(false),
    notifyWeeklyRecap: z.boolean().default(true),
    notifyFriendsTrainedToday: z.boolean().default(true),
    notifyWaterReminder: z.boolean().default(false),
    notifyTrialEnding: z.boolean().default(true),
    notifyBillingIssue: z.boolean().default(true),
    notifyDailyGoal: z.boolean().default(true),
    // notifyMissedMeal continua SEM toggle na UI: aquele driver ("você não
    // registrou o almoço") nunca chegou a existir — vivia na rota
    // nutrition/reminders/trigger, que lia uma tabela nunca criada e foi removida
    // em 05/09/2026. A pref fica no schema porque o map de tipos a referencia.
    // notifyMealReminders VOLTOU à UI na mesma data: o cron `meal-reminders` lê o
    // horário do próprio plano alimentar.
    notifyMissedMeal: z.boolean().default(false),
    notifyChallenges: z.boolean().default(true),
    notifyMealReminders: z.boolean().default(true),
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
    // Ajuste de meta calórica em dias de descanso (consumido por nutrition/page + NutritionOverlay).
    // Antes só sobrevivia via .passthrough() — sem entrada no schema, o default/reset não o conheciam.
    // Default ON: os consumidores tratam ausente como ligado (`!== false`).
    restDayAdjustEnabled: z.boolean().default(true),
    requireBiometricsOnStartup: z.boolean().default(false),
    // ── Integrations ──────────────────────────────────────────────────────────
    appleHealthSync: z.boolean().default(false),
    // ── Geofencing — auto check-in (iOS only, opt-in) ─────────────────────────
    gymGeofenceEnabled: z.boolean().default(false),
    /** Coordinates of the favourite gym + display name. iOS uses these to
     *  monitor a CLCircularRegion (~120 m) and prompt the user upon entry. */
    favoriteGymName: z.string().default(''),
    favoriteGymLat: z.number().nullable().default(null),
    favoriteGymLng: z.number().nullable().default(null),
    // ── Story (Instagram) ─────────────────────────────────────────────────────
    /** Último template de estilo escolhido no composer de Story (treino). */
    storyTemplate: z.string().default('classic'),
    /** Último template escolhido no composer de Story de nutrição. */
    nutritionStoryTemplate: z.string().default('fresh'),
    /** Último template escolhido no composer de Story de cardio de rua. */
    cardioStoryTemplate: z.string().default('fresh'),
    /** Último template escolhido no composer de Story de métricas (admin). */
    metricsStoryTemplate: z.string().default('fresh'),
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
