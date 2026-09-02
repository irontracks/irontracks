/**
 * Guard da auditoria 2026-08-13 (SEC-03): o catálogo único de dados do usuário
 * precisa cobrir TODA tabela de produção, com decisão de exclusão E de
 * exportação — e as rotas precisam consumi-lo (a fiação, não só as pontas).
 *
 * O snapshot abaixo foi medido no banco em 22/08/2026 (SQL no cabeçalho do
 * catálogo). Tabela criada depois disso SEM entrada no catálogo reprova aqui —
 * esse vermelho é o pedido de decisão, não um falso positivo. Ao adicionar
 * tabela nova: decida mecanismo + export no catálogo E acrescente o nome ao
 * snapshot.
 *
 * ⚠️ O snapshot é uma FOTO: ele não pergunta nada ao banco, então enquanto
 * ninguém o atualiza o guard fica CEGO para tudo que entrou depois — e foi o
 * que aconteceu entre 14/08 e 22/08. Passaram despercebidas SEIS tabelas: as
 * quatro do treino em equipe (restaurado no #859) e as duas do import de ficha
 * por foto (#881, que guarda IMAGEM do usuário). `assessment_photos`, que
 * estava no snapshot, já não existe no banco. Ao mexer em schema, re-rode o
 * SQL do cabeçalho do catálogo e compare — a lista não se atualiza sozinha.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  BUCKET_DECISIONS,
  MANUAL_DELETE_STEPS,
  USER_DATA_CATALOG,
  USER_PREFIX_BUCKETS,
} from '@/lib/account/userDataCatalog'

/** `select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'` — 24/08/2026 */
const PROD_TABLES_SNAPSHOT = [
  'access_requests', 'active_workout_sessions', 'admin_emails', 'app_payments', 'app_plans',
  'app_subscriptions', 'appointments', 'asaas_customers', 'asaas_webhook_events', 'assessments', 'audit_events', 'body_photo_assessment_photos', 'body_photo_assessments', 'cardio_tracks',
  'client_error_events', 'coach_inbox_states', 'daily_nutrition_logs', 'device_push_tokens', 'direct_channels',
  'direct_messages', 'error_reports', 'exercise_alias_jobs', 'exercise_aliases', 'exercise_canonical',
  'exercise_execution_submissions', 'exercise_library', 'exercise_muscle_maps', 'exercise_substitutions',
  'exercise_videos', 'exercises', 'foods_off_cache', 'foods_taco', 'gym_checkins', 'invites', 'lab_exam_files',
  'lab_exams', 'lab_result_markers', 'lab_results', 'live_activity_push_tokens', 'marketplace_payments',
  'marketplace_subscriptions', 'mercadopago_webhook_events', 'muscle_weekly_summaries', 'notifications',
  'nutrition_custom_foods', 'nutrition_day_flags', 'nutrition_favorite_meals', 'nutrition_goals', 'nutrition_learned_foods',
  'nutrition_meal_entries', 'onboarding_events', 'password_recovery_codes', 'phone_verifications', 'photos',
  'profiles', 'referrals', 'rest_day_intents', 'sets', 'sets_audit', 'social_follows', 'social_stories',
  'social_story_comments', 'social_story_likes', 'social_story_reactions', 'social_story_views',
  'soft_delete_bin', 'student_charges', 'student_diet_plans', 'student_service_plans', 'student_subscriptions',
  'students', 'teacher_plan_subscriptions', 'teacher_plans', 'teacher_tiers', 'teachers',
  'team_chat_messages', 'team_session_presence', 'team_sessions', 'update_notifications',
  'user_achievements', 'user_activity_events', 'user_activity_monthly', 'user_entitlements', 'user_gyms',
  'user_location_settings', 'user_settings', 'user_update_views', 'video_channel_whitelist',
  'vip_chat_messages', 'vip_chat_threads', 'vip_periodization_exercise_state', 'vip_periodization_programs',
  'vip_periodization_workouts', 'vip_profile', 'vip_usage_daily', 'vip_welcome_views', 'webhook_dead_letters',
  'whatsapp_conversations', 'workout_checkins', 'workout_photo_import_files', 'workout_set_media', 'workout_photo_imports',
  'workout_session_logs', 'workout_set_logs',
  'workout_sync_mappings', 'workout_sync_subscriptions', 'workouts',
]

/** `select id from storage.buckets` — 02/09/2026 (`set-media` entrou com a mídia das séries) */
const PROD_BUCKETS_SNAPSHOT = [
  'bioimpedance-files', 'body-photos', 'chat-media', 'execution-videos', 'lab-exams', 'set-media', 'social-stories',
  'workout-imports',
]

const ROOT = path.resolve(__dirname, '../../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

describe('catálogo de dados do usuário (SEC-03, auditoria 2026-08-13)', () => {
  it('cobre exatamente as tabelas de produção — nem falta, nem sobra', () => {
    const catalogTables = Object.keys(USER_DATA_CATALOG).sort()
    const snapshot = [...PROD_TABLES_SNAPSHOT].sort()
    const faltando = snapshot.filter((t) => !catalogTables.includes(t))
    const sobrando = catalogTables.filter((t) => !snapshot.includes(t))
    expect(faltando, 'tabela de produção SEM decisão no catálogo — decida mecanismo+export').toEqual([])
    expect(sobrando, 'entrada do catálogo sem tabela correspondente — schema mudou? refaça o snapshot').toEqual([])
  })

  it('toda decisão não-óbvia carrega o motivo', () => {
    for (const [table, entry] of Object.entries(USER_DATA_CATALOG)) {
      if (['retain', 'none', 'manual-special', 'anonymize'].includes(entry.mechanism)) {
        expect(entry.reason, `${table}: mecanismo '${entry.mechanism}' exige reason`).toBeTruthy()
      }
      if (entry.export.kind === 'skip') {
        expect(entry.export.reason, `${table}: export skip exige reason`).toBeTruthy()
      }
      if (entry.mechanism === 'manual') {
        expect(entry.ownerCols?.length, `${table}: manual exige ownerCols`).toBeGreaterThan(0)
      }
    }
  })

  it('todo passo manual do catálogo vira passo de delete — e error_reports vem PRIMEIRO', () => {
    const manualTables = Object.entries(USER_DATA_CATALOG)
      .filter(([, e]) => e.mechanism === 'manual')
      .map(([t]) => t)
      .sort()
    const stepTables = MANUAL_DELETE_STEPS.map((s) => s.table).sort()
    expect(stepTables).toEqual(manualTables)
    // ON DELETE RESTRICT: com linhas em error_reports o deleteUser FALHA.
    expect(MANUAL_DELETE_STEPS[0]?.table).toBe('error_reports')
  })

  it('todo bucket de produção tem decisão — e os de prefixo constam da lista varrida', () => {
    const decididos = Object.keys(BUCKET_DECISIONS).sort()
    expect(decididos).toEqual([...PROD_BUCKETS_SNAPSHOT].sort())
    for (const bucket of USER_PREFIX_BUCKETS) {
      expect(PROD_BUCKETS_SNAPSHOT, `bucket varrido inexistente: ${bucket}`).toContain(bucket)
    }
  })

  it('parents de export "via" existem e não são skip (cadeia resolvível)', () => {
    for (const [table, entry] of Object.entries(USER_DATA_CATALOG)) {
      if (entry.export.kind !== 'via') continue
      const parent = USER_DATA_CATALOG[entry.export.parent]
      expect(parent, `${table}: mãe '${entry.export.parent}' não está no catálogo`).toBeTruthy()
      expect(parent.export.kind, `${table}: mãe '${entry.export.parent}' é skip — a cadeia nunca resolve`).not.toBe('skip')
    }
  })

  // ── Fiação: as rotas consomem o catálogo, não listas próprias ──────────────
  it('as rotas de export e delete importam o catálogo', () => {
    const exportSrc = read('src/app/api/account/export/route.ts')
    const deleteSrc = read('src/app/api/account/delete/route.ts')
    expect(exportSrc).toMatch(/from '@\/lib\/account\/userDataCatalog'/)
    expect(deleteSrc).toMatch(/MANUAL_DELETE_STEPS/)
    expect(deleteSrc).toMatch(/USER_PREFIX_BUCKETS/)
  })

  it('nenhuma rota de conta volta a listar tabela à mão fora do catálogo', () => {
    // O único from() literal permitido no delete fora do motor é o dos passos
    // especiais documentados (chat-media scan, access_requests, audit_events).
    // .storage.from() é bucket, não tabela — sai antes do match.
    const deleteSrc = read('src/app/api/account/delete/route.ts').replace(/\.storage\s*\.from\('[^']+'\)/g, '')
    const literals = [...deleteSrc.matchAll(/\.from\('([^']+)'\)/g)].map((m) => m[1])
    const permitidos = new Set(['direct_channels', 'direct_messages', 'access_requests', 'audit_events'])
    const fora = literals.filter((t) => !permitidos.has(t))
    expect(fora, 'delete voltou a apagar tabela à mão — mova a decisão para o catálogo').toEqual([])
  })
})
