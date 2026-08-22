/**
 * Catálogo ÚNICO dos dados do usuário — SEC-03 (auditoria 2026-08-13).
 *
 * Uma entrada por tabela do schema `public` de produção, com DUAS decisões:
 * o que acontece na EXCLUSÃO da conta e o que entra na EXPORTAÇÃO LGPD.
 * As rotas /api/account/export e /api/account/delete são DIRIGIDAS por este
 * módulo — tabela nova sem decisão aqui reprova no guard
 * (`__tests__/userDataCatalog.test.ts`), que também confere que as rotas
 * consomem cada passo (fiação, não só as pontas).
 *
 * ── Fonte dos fatos (medidos no banco em 14/08/2026, não presumidos) ─────────
 * A maior parte das tabelas tem FK para auth.users com ON DELETE CASCADE: o
 * `deleteUser` limpa sozinho. O que precisa de ação manual é o que NÃO tem FK
 * (órfãs), o que tem RESTRICT (trava a exclusão do Auth — `error_reports`!) e
 * o STORAGE (nunca cascateia). Para re-medir após mudança de schema:
 *
 *   -- mecanismo por tabela (FKs para auth.users):
 *   select conrelid::regclass::text, pg_get_constraintdef(oid)
 *   from pg_constraint where contype='f' and confrelid='auth.users'::regclass;
 *   -- colunas de usuário SEM FK (candidatas a órfãs → manual):
 *   ver SQL completo no PR #808.
 *
 * ── Mecanismos ───────────────────────────────────────────────────────────────
 * cascade        FK → auth.users ON DELETE CASCADE; o banco apaga no deleteUser.
 * child-cascade  FK → tabela-mãe ON DELETE CASCADE; morre com a mãe.
 * manual         SEM FK nas colunas de usuário — a rota de delete apaga
 *                explicitamente ANTES do deleteUser (senão vira linha órfã).
 * manual-special passo manual que não é "delete or-eq userId" (ex.: por email).
 * anonymize      FK ON DELETE SET NULL desvincula a autoria; conteúdo fica.
 * retain         mantida de propósito (fiscal/trilha) — reason obrigatória.
 * none           não guarda dado pessoal do titular — reason obrigatória.
 *
 * ── Dívidas documentadas (decisão do dono, não esquecimento) ─────────────────
 * 1. app_payments/app_subscriptions/asaas_customers/marketplace_* têm CASCADE
 *    hoje — o banco APAGA registro financeiro na exclusão, contradizendo a
 *    retenção fiscal usual. Mudar exige migration de FK; fica registrado.
 * 2. Mídia no CLOUDINARY (avatar/foto de avaliação antiga) não é coberta pela
 *    exclusão — não há inventário de public_ids por usuário. Pendência.
 * 3. `teachers`/`students` com SET NULL deixariam nome/CREF órfãos — por isso
 *    são `manual` aqui, apagadas antes do SET NULL acontecer.
 */

export type Mechanism =
  | 'cascade'
  | 'child-cascade'
  | 'manual'
  | 'manual-special'
  | 'anonymize'
  | 'retain'
  | 'none'

export interface ExportOwn {
  kind: 'own'
  /** Colunas comparadas ao userId (OR entre elas). */
  cols: string[]
  limit?: number
}
export interface ExportVia {
  kind: 'via'
  /** Tabela-mãe cujos ids já foram coletados no export. */
  parent: string
  /** Coluna desta tabela que aponta para a mãe. */
  parentCol: string
  limit?: number
}
export interface ExportSkip {
  kind: 'skip'
  reason: string
}
export type ExportPlan = ExportOwn | ExportVia | ExportSkip

export interface TableEntry {
  mechanism: Mechanism
  /** Colunas de usuário usadas pelo passo manual de delete (OR entre elas). */
  ownerCols?: string[]
  /** Obrigatória para retain/none/manual-special/anonymize. */
  reason?: string
  export: ExportPlan
}

const own = (cols: string[], limit = 5000): ExportOwn => ({ kind: 'own', cols, limit })
const via = (parent: string, parentCol: string, limit = 20000): ExportVia => ({ kind: 'via', parent, parentCol, limit })
const skip = (reason: string): ExportSkip => ({ kind: 'skip', reason })

/**
 * Snapshot das tabelas BASE do schema public em produção (14/08/2026).
 * O guard exige 1:1 com as chaves do catálogo — tabela nova no banco sem
 * decisão aqui é exatamente o alerta que o teste deve dar.
 */
export const USER_DATA_CATALOG: Record<string, TableEntry> = {
  // ── Conta e perfil ─────────────────────────────────────────────────────────
  profiles: { mechanism: 'cascade', export: { kind: 'own', cols: ['id'], limit: 1 } },
  user_settings: { mechanism: 'manual', ownerCols: ['user_id'], export: own(['user_id']) },
  access_requests: {
    mechanism: 'manual-special',
    reason: 'chaveada por EMAIL (nome, nascimento, telefone) — delete por auth.user.email',
    export: skip('chaveada por email; o conteúdo (nome/telefone) já está no perfil exportado'),
  },
  phone_verifications: {
    mechanism: 'none',
    reason: 'OTP efêmero chaveado por telefone, expira sozinho (expires_at); sem vínculo confiável com user_id',
    export: skip('efêmero, sem vínculo com a conta'),
  },
  password_recovery_codes: {
    mechanism: 'cascade',
    export: skip('só hashes de códigos — sem valor ao titular e reexibir seria brecha'),
  },
  referrals: { mechanism: 'manual', ownerCols: ['referrer_id', 'referred_id'], export: own(['referrer_id', 'referred_id']) },

  // ── Treino ─────────────────────────────────────────────────────────────────
  workouts: { mechanism: 'cascade', export: own(['user_id']) },
  exercises: { mechanism: 'child-cascade', export: via('workouts', 'workout_id') },
  sets: { mechanism: 'child-cascade', export: via('exercises', 'exercise_id', 40000) },
  active_workout_sessions: { mechanism: 'manual', ownerCols: ['user_id'], export: own(['user_id']) },
  workout_checkins: { mechanism: 'manual', ownerCols: ['user_id'], export: own(['user_id']) },
  workout_session_logs: { mechanism: 'cascade', export: own(['user_id']) },
  workout_set_logs: { mechanism: 'child-cascade', export: via('workout_session_logs', 'session_id', 40000) },
  workout_sync_subscriptions: { mechanism: 'manual', ownerCols: ['student_id', 'teacher_id'], export: own(['student_id', 'teacher_id']) },
  workout_sync_mappings: { mechanism: 'child-cascade', export: skip('mapeamento técnico treino↔treino, sem dado do titular além dos ids já exportados') },
  rest_day_intents: { mechanism: 'cascade', export: own(['user_id']) },
  // Import de ficha por foto/PDF (#881). Os ARQUIVOS ficam no bucket
  // workout-imports (prefixo userId) — storage nunca cascateia, é o varrimento
  // por prefixo que os remove.
  workout_photo_imports: { mechanism: 'cascade', export: own(['user_id']) },
  workout_photo_import_files: { mechanism: 'child-cascade', export: via('workout_photo_imports', 'import_id') },
  muscle_weekly_summaries: { mechanism: 'cascade', export: own(['user_id']) },
  user_achievements: { mechanism: 'cascade', export: own(['user_id']) },
  cardio_tracks: { mechanism: 'cascade', export: own(['user_id']) },
  exercise_aliases: { mechanism: 'cascade', export: own(['user_id']) },
  exercise_canonical: { mechanism: 'cascade', export: own(['user_id']) },
  exercise_muscle_maps: { mechanism: 'cascade', export: own(['user_id']) },
  exercise_alias_jobs: { mechanism: 'cascade', export: skip('fila técnica de normalização de nomes; o resultado está em exercise_aliases') },
  exercise_execution_submissions: { mechanism: 'cascade', export: own(['student_user_id']) },
  exercise_videos: {
    mechanism: 'anonymize',
    reason: 'biblioteca compartilhada; created_by vira NULL (SET NULL) e o vídeo segue servindo os demais',
    export: own(['created_by']),
  },

  // ── Nutrição ───────────────────────────────────────────────────────────────
  nutrition_goals: { mechanism: 'cascade', export: own(['user_id']) },
  nutrition_meal_entries: { mechanism: 'cascade', export: own(['user_id'], 20000) },
  nutrition_learned_foods: { mechanism: 'cascade', export: own(['user_id']) },
  nutrition_custom_foods: { mechanism: 'cascade', export: own(['user_id']) },
  nutrition_favorite_meals: { mechanism: 'cascade', export: own(['user_id']) },
  daily_nutrition_logs: { mechanism: 'cascade', export: own(['user_id'], 20000) },
  student_diet_plans: { mechanism: 'manual', ownerCols: ['user_id'], export: own(['user_id']) },

  // ── Avaliações e saúde ─────────────────────────────────────────────────────
  assessments: { mechanism: 'manual', ownerCols: ['student_id', 'trainer_id'], export: own(['student_id', 'trainer_id'], 2000) },
  body_photo_assessments: { mechanism: 'cascade', export: own(['user_id']) },
  body_photo_assessment_photos: { mechanism: 'child-cascade', export: via('body_photo_assessments', 'assessment_id') },
  lab_exams: { mechanism: 'cascade', export: own(['user_id']) },
  lab_exam_files: { mechanism: 'child-cascade', export: via('lab_exams', 'exam_id') },
  lab_results: { mechanism: 'cascade', export: own(['user_id']) },
  lab_result_markers: { mechanism: 'child-cascade', export: via('lab_results', 'lab_result_id', 40000) },
  photos: { mechanism: 'cascade', export: own(['user_id']) },
  gym_checkins: { mechanism: 'cascade', export: own(['user_id']) },
  user_gyms: { mechanism: 'cascade', export: own(['user_id']) },
  user_location_settings: { mechanism: 'cascade', export: own(['user_id']) },

  // ── Social e mensagens ─────────────────────────────────────────────────────
  social_stories: { mechanism: 'manual', ownerCols: ['author_id'], export: own(['author_id']) },
  social_story_comments: { mechanism: 'cascade', export: own(['user_id']) },
  social_story_likes: { mechanism: 'cascade', export: own(['user_id']) },
  social_story_reactions: { mechanism: 'cascade', export: own(['user_id']) },
  social_story_views: { mechanism: 'cascade', export: own(['viewer_id'], 20000) },
  social_follows: { mechanism: 'manual', ownerCols: ['follower_id', 'following_id'], export: own(['follower_id', 'following_id']) },
  direct_channels: { mechanism: 'cascade', export: own(['user1_id', 'user2_id']) },
  direct_messages: { mechanism: 'child-cascade', export: own(['sender_id'], 20000) },
  notifications: { mechanism: 'manual', ownerCols: ['recipient_id', 'sender_id'], export: own(['user_id', 'recipient_id'], 10000) },
  whatsapp_conversations: { mechanism: 'manual', ownerCols: ['user_id'], export: own(['user_id']) },
  coach_inbox_states: { mechanism: 'cascade', export: own(['student_user_id']) },

  // ── Treino em equipe ──────────────────────────────────────────────────────
  // Aposentado em 14/07/2026 e RESTAURADO no PR #859 (18/08/2026). As 4 FKs
  // para auth.users são ON DELETE CASCADE (conferidas no banco em 22/08/2026),
  // então a exclusão da conta limpa sozinha — mas a decisão precisa constar
  // aqui, e o chat é conteúdo escrito pelo titular: vai no export.
  invites: { mechanism: 'cascade', export: own(['from_uid', 'to_uid']) },
  team_sessions: { mechanism: 'cascade', export: own(['host_uid']) },
  team_session_presence: { mechanism: 'cascade', export: own(['user_id']) },
  team_chat_messages: { mechanism: 'cascade', export: own(['user_id'], 20000) },

  // ── Professor / marketplace ────────────────────────────────────────────────
  teachers: {
    mechanism: 'manual',
    ownerCols: ['user_id'],
    reason: 'FK é SET NULL — deixaria nome/CREF órfãos; apagar antes',
    export: own(['user_id']),
  },
  students: { mechanism: 'manual', ownerCols: ['user_id'], export: own(['user_id']) },
  teacher_plans: { mechanism: 'cascade', export: own(['teacher_user_id']) },
  teacher_plan_subscriptions: { mechanism: 'cascade', export: own(['user_id']) },
  student_service_plans: { mechanism: 'manual', ownerCols: ['teacher_user_id'], export: own(['teacher_user_id']) },
  student_subscriptions: {
    mechanism: 'retain',
    reason: 'registro contratual aluno↔professor; sustenta as cobranças retidas (student_charges)',
    export: own(['student_user_id', 'teacher_user_id']),
  },
  student_charges: {
    mechanism: 'retain',
    reason: 'registro financeiro (obrigação fiscal/disputa); sem FK de propósito',
    export: own(['student_user_id', 'teacher_user_id']),
  },
  marketplace_subscriptions: { mechanism: 'cascade', export: own(['student_user_id', 'teacher_user_id']) },
  marketplace_payments: { mechanism: 'cascade', export: own(['student_user_id', 'teacher_user_id']) },
  appointments: { mechanism: 'manual', ownerCols: ['student_id'], export: own(['student_id']) },

  // ── VIP / pagamentos do app ────────────────────────────────────────────────
  vip_profile: { mechanism: 'cascade', export: own(['user_id']) },
  vip_chat_threads: { mechanism: 'cascade', export: own(['user_id']) },
  vip_chat_messages: { mechanism: 'child-cascade', export: own(['user_id'], 20000) },
  vip_periodization_programs: { mechanism: 'cascade', export: own(['user_id']) },
  vip_periodization_workouts: { mechanism: 'child-cascade', export: via('vip_periodization_programs', 'program_id') },
  vip_periodization_exercise_state: { mechanism: 'child-cascade', export: via('vip_periodization_programs', 'program_id') },
  vip_usage_daily: { mechanism: 'cascade', export: own(['user_id']) },
  vip_welcome_views: { mechanism: 'cascade', export: own(['user_id']) },
  user_entitlements: { mechanism: 'cascade', export: own(['user_id']) },
  app_subscriptions: { mechanism: 'cascade', export: own(['user_id']) },
  app_payments: { mechanism: 'cascade', export: own(['user_id']) },
  asaas_customers: { mechanism: 'cascade', export: own(['user_id']) },

  // ── Dispositivo e telemetria ───────────────────────────────────────────────
  device_push_tokens: { mechanism: 'cascade', export: own(['user_id']) },
  live_activity_push_tokens: { mechanism: 'cascade', export: own(['user_id']) },
  user_update_views: { mechanism: 'cascade', export: own(['user_id']) },
  onboarding_events: { mechanism: 'manual', ownerCols: ['user_id'], export: own(['user_id']) },
  user_activity_events: { mechanism: 'manual', ownerCols: ['user_id'], export: own(['user_id'], 20000) },
  client_error_events: { mechanism: 'manual', ownerCols: ['user_id'], export: own(['user_id']) },
  error_reports: {
    mechanism: 'manual',
    ownerCols: ['user_id'],
    reason: 'FK é ON DELETE RESTRICT — com linhas presentes o deleteUser FALHA; apagar antes é obrigatório',
    export: own(['user_id']),
  },

  // ── Trilhas retidas ────────────────────────────────────────────────────────
  audit_events: {
    mechanism: 'retain',
    reason: 'trilha de segurança — inclusive a prova de que a própria exclusão aconteceu (account_deleted)',
    export: skip('trilha de segurança; leitura sob demanda do dono via SQL'),
  },
  sets_audit: {
    mechanism: 'retain',
    reason: 'trilha de auditoria de mutação de séries (investigação de incidente)',
    export: skip('trilha interna; o conteúdo útil ao titular já sai em workouts/exercises/sets'),
  },
  soft_delete_bin: {
    mechanism: 'retain',
    reason: 'lixeira com purga própria (purge_after); esvazia sozinha',
    export: skip('lixeira interna de curta retenção'),
  },

  // ── Sem dado pessoal do titular ────────────────────────────────────────────
  admin_emails: { mechanism: 'none', reason: 'config administrativa', export: skip('config administrativa') },
  app_plans: { mechanism: 'none', reason: 'catálogo global de planos', export: skip('catálogo global') },
  exercise_library: { mechanism: 'none', reason: 'biblioteca global de exercícios', export: skip('catálogo global') },
  exercise_substitutions: { mechanism: 'none', reason: 'grafo global de substituições', export: skip('catálogo global') },
  foods_off_cache: { mechanism: 'none', reason: 'cache do OpenFoodFacts', export: skip('cache público') },
  foods_taco: { mechanism: 'none', reason: 'tabela TACO pública', export: skip('tabela pública') },
  teacher_tiers: { mechanism: 'none', reason: 'catálogo de tiers', export: skip('catálogo global') },
  update_notifications: { mechanism: 'none', reason: 'avisos de versão do app', export: skip('conteúdo do app') },
  user_activity_monthly: { mechanism: 'none', reason: 'agregado mensal sem titular identificável', export: skip('agregado sem titular') },
  video_channel_whitelist: { mechanism: 'none', reason: 'allowlist global de canais', export: skip('config global') },
  asaas_webhook_events: { mechanism: 'none', reason: 'log operacional do provedor', export: skip('log operacional') },
  mercadopago_webhook_events: { mechanism: 'none', reason: 'log operacional do provedor', export: skip('log operacional') },
  webhook_dead_letters: { mechanism: 'none', reason: 'fila operacional de reentrega', export: skip('fila operacional') },
}

/**
 * Passos manuais de delete, derivados do catálogo — 1 fonte, zero cópia.
 * Rodam ANTES do deleteUser. `error_reports` vem PRIMEIRO: é RESTRICT, e sem
 * essa linha nenhuma exclusão de quem já reportou erro conclui.
 */
export const MANUAL_DELETE_STEPS: { table: string; cols: string[] }[] = Object.entries(USER_DATA_CATALOG)
  .filter(([, entry]) => entry.mechanism === 'manual')
  .map(([table, entry]) => ({ table, cols: entry.ownerCols ?? [] }))
  .sort((a, b) => (a.table === 'error_reports' ? -1 : b.table === 'error_reports' ? 1 : a.table.localeCompare(b.table)))

/**
 * Buckets cujo path começa com `${userId}/` (convenção conferida nas rotas de
 * signed-upload de cada um) — a exclusão varre o prefixo e remove.
 * `chat-media` NÃO está aqui: o path é `${channelId}/...`; os objetos são
 * resolvidos pelas URLs gravadas em direct_messages ANTES do cascade.
 */
export const USER_PREFIX_BUCKETS = [
  'body-photos',
  'lab-exams',
  'bioimpedance-files',
  'social-stories',
  'execution-videos',
  'workout-imports',
] as const

/** Decisão por bucket — o guard exige que todo bucket de produção conste. */
export const BUCKET_DECISIONS: Record<string, string> = {
  'body-photos': 'prefixo userId — varrido na exclusão',
  'lab-exams': 'prefixo userId — varrido na exclusão',
  'bioimpedance-files': 'prefixo userId — varrido na exclusão',
  'social-stories': 'prefixo userId — varrido na exclusão',
  'execution-videos': 'prefixo userId — varrido na exclusão',
  'workout-imports': 'prefixo userId (`${userId}/imports/...`) — varrido na exclusão',
  'chat-media': 'path por canal — objetos resolvidos via direct_messages antes do cascade',
}
