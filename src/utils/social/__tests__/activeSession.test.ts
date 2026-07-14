import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ACTIVE_SESSION_STALE_MS, isSessionFresh, activeSessionCutoffIso } from '@/utils/social/activeSession'

const NOW = new Date('2026-07-14T08:28:00Z').getTime()
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString()

describe('frescor da sessão de treino', () => {
  it('sessão que bateu heartbeat agora está treinando', () => {
    expect(isSessionFresh(minsAgo(0), NOW)).toBe(true)
    expect(isSessionFresh(minsAgo(12), NOW)).toBe(true)
  })

  it('tolera descanso longo / app em background (o heartbeat só grava se o estado muda)', () => {
    expect(isSessionFresh(minsAgo(40), NOW)).toBe(true)
  })

  it('NÃO conta a sessão zumbi — a linha nunca expira sozinha no banco', () => {
    // Casos reais de produção em 14/07: "Apple Review" com updated_at de 12/07 e
    // "Leandro" de 20/04 — ambos apareceriam como treinando agora.
    expect(isSessionFresh(minsAgo(60 * 48), NOW)).toBe(false)
    expect(isSessionFresh('2026-04-20T23:04:16Z', NOW)).toBe(false)
  })

  it('trata updated_at ausente/inválido como NÃO treinando (fail-closed)', () => {
    expect(isSessionFresh(null, NOW)).toBe(false)
    expect(isSessionFresh('', NOW)).toBe(false)
    expect(isSessionFresh('não é data', NOW)).toBe(false)
  })

  it('relógio do cliente adiantado não derruba a sessão', () => {
    expect(isSessionFresh(minsAgo(-5), NOW)).toBe(true)
  })

  it('o corte ISO bate com a janela', () => {
    expect(activeSessionCutoffIso(NOW)).toBe(new Date(NOW - ACTIVE_SESSION_STALE_MS).toISOString())
  })
})

describe('"Treinando agora" não pode voltar a usar presença de app aberto (guard)', () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

  it('a Comunidade consome a sessão de treino, não o online_users do Redis', () => {
    // Bug: o card era montado com /api/social/presence/list — o sorted set que só
    // registra "abriu o app". O iOS desperta o WebView em background, então amigo
    // aparecia "TREINANDO AGORA" às 5h da manhã sem treino nenhum.
    const hook = read('src/app/(app)/community/useCommunityData.ts')
    expect(hook).not.toContain('/api/social/presence/list')
    expect(hook).toContain('/api/social/training-now')
  })

  it('a rota corta por frescor do updated_at e só devolve quem o chamador segue', () => {
    const route = read('src/app/api/social/training-now/route.ts')
    expect(route).toContain('active_workout_sessions')
    expect(route).toContain('activeSessionCutoffIso()')
    expect(route).toContain("eq('status', 'accepted')")
  })

  it('o cron e o painel do professor usam o mesmo corte de frescor', () => {
    expect(read('src/utils/cron/activeSessionFilter.ts')).toContain('activeSessionCutoffIso()')
    expect(read('src/hooks/useTeacherStudentSessions.ts')).toContain('isSessionFresh(row.updated_at)')
  })
})
