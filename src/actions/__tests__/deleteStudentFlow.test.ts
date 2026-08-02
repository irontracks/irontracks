import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const route = readFileSync(
  join(process.cwd(), 'src/app/api/admin/students/delete/route.ts'),
  'utf8',
)
const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260718042000_fix_complete_student_deletion.sql'),
  'utf8',
)

describe('exclusão completa de aluno', () => {
  it('usa o schema atual de audit_events', () => {
    expect(migration).not.toMatch(/\btarget_id\b/)
    expect(migration).not.toMatch(/\btarget_email\b/)
    expect(migration).not.toMatch(/\bdetails\b/)
    expect(migration).toContain('entity_type')
    expect(migration).toContain('entity_id')
    expect(migration).toContain('metadata')
  })

  it('restringe as RPCs ao service_role', () => {
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'")
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.get_student_deletion_plan[\s\S]*FROM PUBLIC, anon, authenticated/i)
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.delete_student_cascade[\s\S]*FROM PUBLIC, anon, authenticated/i)
  })

  it('inclui Storage e tabelas sem FK no plano de limpeza', () => {
    expect(migration).toContain('storage.objects')
    expect(migration).toContain("o.bucket_id = 'chat-media'")
    for (const table of [
      'appointments',
      'body_photo_assessment_photos',
      'lab_exam_files',
      'notifications',
      'student_charges',
      'student_diet_plans',
      'student_subscriptions',
      'user_activity_events',
    ]) {
      expect(migration).toContain(`public.${table}`)
    }
  })

  it('remove Storage e auth.users antes da limpeza final', () => {
    const planIndex = route.indexOf("admin.rpc('get_student_deletion_plan'")
    const storageIndex = route.indexOf("admin.storage.from(bucketId).remove")
    const authIndex = route.indexOf('admin.auth.admin.deleteUser')
    const cascadeIndex = route.indexOf("admin.rpc('delete_student_cascade'")

    expect(planIndex).toBeGreaterThan(-1)
    expect(storageIndex).toBeGreaterThan(planIndex)
    expect(authIndex).toBeGreaterThan(storageIndex)
    expect(cascadeIndex).toBeGreaterThan(authIndex)
  })

  it('não ignora erro retornado por deleteUser', () => {
    expect(route).toMatch(/const \{ error: authDeleteError \} = await admin\.auth\.admin\.deleteUser/)
    expect(route).toMatch(/if \(authDeleteError && authDeleteError\.status !== 404\)/)
  })
})
