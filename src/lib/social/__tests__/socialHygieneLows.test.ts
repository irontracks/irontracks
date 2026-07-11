import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

/**
 * Guards dos LOWs da auditoria social/feed:
 *  A — stories/react: registra o like via RLS (can_view_story) ANTES de notificar, e
 *      só notifica o autor com dedup (5min). Antes notificava via admin independente da
 *      visibilidade e sem dedup → flood/assédio.
 *  C — direct-message: nome do remetente derivado do PERFIL no servidor, não do body
 *      (anti-spoofing do título da notificação/push).
 *  D — rotas/componente órfãos de gym-presence removidos (dead code + risco latente).
 */
describe('A — stories/react: visibilidade via RLS + dedup', () => {
  const src = readFileSync('src/app/api/social/stories/react/route.ts', 'utf8')

  it('faz o upsert do like via auth.supabase e retorna 403 se a RLS barrar', () => {
    expect(src).toMatch(/auth\.supabase[\s\S]*from\('social_story_likes'\)[\s\S]*upsert/)
    expect(src).toMatch(/likeErr[\s\S]*status:\s*403/)
  })

  it('só notifica o autor com dedup via cacheSetNx', () => {
    expect(src).toMatch(/cacheSetNx\(`social:react:push:/)
    expect(src).toMatch(/if\s*\(\s*isNew\s*\)/)
  })
})

describe('C — direct-message: nome do remetente do servidor (anti-spoofing)', () => {
  const src = readFileSync('src/app/api/notifications/direct-message/route.ts', 'utf8')

  it('deriva o nome de profiles.display_name do próprio user, não do body', () => {
    expect(src).toMatch(/from\('profiles'\)[\s\S]*display_name[\s\S]*\.eq\('id',\s*user\.id\)/)
    expect(src).toMatch(/resolvedSenderName/)
    expect(src).toMatch(/safeSenderName = resolvedSenderName\.slice/)
  })
})

describe('D — rotas/componente órfãos de gym-presence removidos', () => {
  it('GymPresenceCard, gym-presence e gym-leaderboard não existem mais', () => {
    expect(existsSync('src/components/social/GymPresenceCard.tsx')).toBe(false)
    expect(existsSync('src/app/api/social/gym-presence/route.ts')).toBe(false)
    expect(existsSync('src/app/api/social/gym-leaderboard/route.ts')).toBe(false)
  })
})
