/**
 * Guard da consolidação RLS — FASE 2 (perf, ago/2026).
 *
 * Mesmos invariantes da fase 1 (create antes de drop, nada de TO public novo)
 * MAIS o invariante de segurança que não pode regredir NUNCA (brecha de
 * self-grant corrigida em 2026-07-11): as policies de ESCRITA de
 * user_entitlements são admin-only — nenhuma pode conter user_id = auth.uid().
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const sql = readFileSync(
    path.resolve(__dirname, '../../../../supabase/migrations/20260802160000_rls_consolidate_phase2.sql'),
    'utf8',
).toLowerCase()

const GROUPS: Array<{ creates: string[]; drops: string[] }> = [
    { creates: ['device_push_tokens_all__own'], drops: ['users_own_tokens', 'device_push_tokens_delete_own', 'device_push_tokens_insert_own', 'device_push_tokens_select_own', 'device_push_tokens_update_own'] },
    { creates: ['student_diet_plans_select__merged', 'student_diet_plans_insert_admin', 'student_diet_plans_update_admin', 'student_diet_plans_delete_admin'], drops: ['student_diet_plans_admin_all', 'student_diet_plans_select_own'] },
    { creates: ['workout_sync_subscriptions_service', 'workout_sync_subscriptions_select__merged'], drops: ['workout_sync_subscriptions_service_role_all', 'workout_sync_subscriptions_actor_select', 'workout_sync_subscriptions_select'] },
    { creates: ['workout_sync_mappings_service'], drops: ['workout_sync_mappings_service_role_all'] },
    { creates: ['profiles_insert__merged', 'profiles_update__merged', 'profiles_delete_admin'], drops: ['profiles_admin_all', 'profiles_insert_own', 'profiles_update_own'] },
    { creates: ['app_plans_select__merged', 'app_plans_select_active_anon', 'app_plans_insert_admin', 'app_plans_update_admin', 'app_plans_delete_admin'], drops: ['app_plans_write_admin', 'app_plans_select_active'] },
    { creates: ['appointments_select__merged', 'appointments_insert_coach', 'appointments_update_coach', 'appointments_delete_coach'], drops: ['coaches_manage_own_appointments', 'appointments_select_own'] },
    { creates: ['assessments_select__merged', 'assessments_insert__merged', 'assessments_update__merged', 'assessments_delete__merged'], drops: ['assessments_all__merged', 'students view own assessments'] },
    { creates: ['student_charges_select__merged'], drops: ['teacher sees own student charges', 'student sees own charges'] },
    { creates: ['student_service_plans_select__merged'], drops: ['teacher manages own service plans', 'student reads active plans from own teacher'] },
    { creates: ['student_subscriptions_select__merged'], drops: ['teacher sees own students subscriptions', 'student sees own subscription'] },
    { creates: ['user_entitlements_select__merged', 'user_entitlements_insert_admin', 'user_entitlements_update_admin', 'user_entitlements_delete_admin'], drops: ['user_entitlements_admin_all', 'user_entitlements_select_own'] },
]

describe('fase 2: create antes de drop, por grupo', () => {
    for (const g of GROUPS) {
        it(`${g.creates[0]}…`, () => {
            const createIdxs = g.creates.map((c) => sql.indexOf(`create policy ${c}`))
            for (const [i, idx] of createIdxs.entries()) {
                expect(idx, `create de ${g.creates[i]} ausente`).toBeGreaterThan(-1)
            }
            const lastCreate = Math.max(...createIdxs)
            for (const d of g.drops) {
                const dropIdx = sql.indexOf(`drop policy "${d}"`)
                expect(dropIdx, `drop de "${d}" ausente`).toBeGreaterThan(-1)
                expect(dropIdx, `drop de "${d}" antes dos creates do grupo`).toBeGreaterThan(lastCreate)
            }
        })
    }
})

describe('fase 2: invariantes de segurança', () => {
    it('nenhuma policy nova TO public', () => {
        expect(sql).not.toMatch(/create policy[\s\S]{0,300}?to public/)
    })

    it('ZONA VIP: escrita de user_entitlements continua admin-only (anti self-grant)', () => {
        for (const p of ['user_entitlements_insert_admin', 'user_entitlements_update_admin', 'user_entitlements_delete_admin']) {
            const start = sql.indexOf(`create policy ${p}`)
            expect(start).toBeGreaterThan(-1)
            const body = sql.slice(start, sql.indexOf(';', start))
            expect(body).toContain('is_admin')
            expect(body, `${p} não pode conter predicado de dono (self-grant)`).not.toContain('user_id = ( select auth.uid() )')
        }
    })

    it('vip_usage_daily: só REMOVE a duplicata de leitura (nenhum create)', () => {
        expect(sql).toContain('drop policy "users can view own usage" on public.vip_usage_daily')
        expect(sql).not.toMatch(/create policy[^;]*vip_usage_daily/)
    })
})
