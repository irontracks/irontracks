import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Guards do Achado 1 (auditoria do controle professor->aluno):
 *  - workout_sync_subscriptions com writes SÓ service-role (policies de usuário dropadas);
 *  - dead code removido (syncTemplateToSubscribers / isWorkoutSyncActive) — a "bomba-relógio"
 *    de write-IDOR não pode voltar a existir sem alguém reescrevê-la de propósito.
 */
describe('lockdown workout_sync_subscriptions', () => {
  const dir = 'supabase/migrations'
  const file = readdirSync(dir).find((f) => f.includes('lockdown_workout_sync_subscriptions_writes'))
  const sql = file ? readFileSync(path.join(dir, file), 'utf8') : ''
  it('a migration dropa INSERT/UPDATE/DELETE do usuário', () => {
    expect(file).toBeTruthy()
    expect(sql).toMatch(/drop policy if exists workout_sync_subscriptions_insert/i)
    expect(sql).toMatch(/drop policy if exists workout_sync_subscriptions_update/i)
    expect(sql).toMatch(/drop policy if exists workout_sync_subscriptions_delete/i)
  })
})

describe('dead code de sync removido', () => {
  const src = readFileSync('src/lib/workoutSync.ts', 'utf8')
  it('syncTemplateToSubscribers e isWorkoutSyncActive não existem mais', () => {
    expect(src).not.toMatch(/export async function syncTemplateToSubscribers/)
    expect(src).not.toMatch(/export async function isWorkoutSyncActive/)
  })
  it('mantém as funções ainda usadas', () => {
    expect(src).toMatch(/export async function syncAllTemplatesToSubscriber/)
    expect(src).toMatch(/export async function deleteTemplateFromSubscribers/)
  })
})
