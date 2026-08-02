/**
 * Guard da consolidação de policies RLS (perf, ago/2026).
 *
 * A migration mescla policies permissivas duplicadas (owner/trainer,
 * own/silo) com OR literal. Invariantes que NÃO podem regredir na edição do
 * arquivo:
 * 1. toda policy mesclada é criada ANTES dos drops das originais dela —
 *    nunca existe janela sem policy (create → drop, tabela a tabela);
 * 2. os merges são TO authenticated (anon não satisfaz auth.uid(); manter
 *    public reintroduziria a sobreposição public×authenticated no advisor);
 * 3. o fix de initplan usa `( select auth.uid() )` — auth.uid() cru é
 *    reavaliado por linha.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const sql = readFileSync(
    path.resolve(__dirname, '../../../../supabase/migrations/20260802140000_rls_consolidate_permissive_policies.sql'),
    'utf8',
).toLowerCase()

const MERGES: Array<{ create: string; drops: string[] }> = [
    { create: 'workouts_delete__merged', drops: ['workouts_delete_own', 'workouts_delete_silo'] },
    { create: 'workouts_insert__merged', drops: ['workouts_insert_own', 'workouts_insert_silo'] },
    { create: 'workouts_update__merged', drops: ['workouts_update_own', 'workouts_update_silo'] },
    { create: 'assessments_all__merged', drops: ['trainers manage student assessments', 'users manage own assessments', 'assessments_own'] },
    { create: 'body_photo_assessments__merged', drops: ['body_photo_assessments_owner', 'body_photo_assessments_trainer'] },
    { create: 'body_photo_photos__merged', drops: ['body_photo_photos_owner', 'body_photo_photos_trainer'] },
    { create: 'lab_exams__merged', drops: ['lab_exams_owner', 'lab_exams_trainer'] },
    { create: 'lab_exam_files__merged', drops: ['lab_exam_files_owner', 'lab_exam_files_trainer'] },
]

describe('migração de consolidação RLS', () => {
    for (const m of MERGES) {
        it(`${m.create}: create vem antes dos drops das originais`, () => {
            const createIdx = sql.indexOf(`create policy ${m.create}`)
            expect(createIdx).toBeGreaterThan(-1)
            for (const d of m.drops) {
                const dropIdx = sql.indexOf(`drop policy "${d}"`)
                expect(dropIdx, `drop de "${d}" ausente`).toBeGreaterThan(-1)
                expect(dropIdx, `drop de "${d}" antes do create da mesclada`).toBeGreaterThan(createIdx)
            }
        })
    }

    it('merges são TO authenticated (nada de public novo)', () => {
        expect(sql).not.toMatch(/create policy[\s\S]{0,200}?to public/)
    })

    it('fix de initplan usa select auth.uid()', () => {
        const fix = sql.slice(sql.lastIndexOf('create policy teacher_plan_subscriptions_select_own'))
        expect(fix).toContain('( select auth.uid() ) = user_id')
    })

    it('índices das FKs descobertas pelo advisor presentes', () => {
        expect(sql).toContain('exercise_aliases_canonical_user_idx')
        expect(sql).toContain('exercise_substitutions_to_id_idx')
    })
})
