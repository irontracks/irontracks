import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Guards da auditoria social/feed (médios):
 *   #3 — presence/list devolvia o sorted set GLOBAL de online (filtro só no cliente);
 *        agora filtra server-side pelos follows accepted do chamador.
 *   #4 — menção @handle (extractMentions resolve global) notificava/pushava qualquer
 *        conta sem relação; agora restrita a quem pode ver o contexto:
 *        story → seguidor accepted do autor.
 */
describe('presence/list — filtra pelos follows do chamador (não vaza set global)', () => {
  const src = readFileSync('src/app/api/social/presence/list/route.ts', 'utf8')

  it('consulta social_follows accepted do chamador e faz interseção', () => {
    expect(src).toMatch(/from\('social_follows'\)/)
    expect(src).toMatch(/\.eq\('follower_id',\s*auth\.user\.id\)/)
    expect(src).toMatch(/\.eq\('status',\s*'accepted'\)/)
    expect(src).toMatch(/followingSet\.has\(/)
  })

  it('o que é devolvido é o online filtrado, não o set cru do Redis', () => {
    expect(src).toMatch(/const result = online\.filter\(/)
    // o array bruto do Redis é `online`; o retorno usa `result` (já filtrado)
    expect(src).toMatch(/online_users:\s*result\b/)
  })
})

describe('menção em story — só notifica seguidor accepted do autor', () => {
  const src = readFileSync('src/app/api/social/stories/comments/route.ts', 'utf8')

  it('filtra os mencionados por follow accepted ao autor antes de notificar', () => {
    expect(src).toMatch(/rawMentionedIds/)
    expect(src).toMatch(/from\('social_follows'\)[\s\S]*\.eq\('following_id',\s*authorId\)[\s\S]*\.eq\('status',\s*'accepted'\)[\s\S]*\.in\('follower_id',\s*rawMentionedIds\)/)
  })
})
