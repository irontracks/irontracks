import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Regressão (reportado pelo dono): as reações de story "não fixavam". Causa: a rota /react só
 * gravava o LIKE (story_id, user_id) — o EMOJI não era persistido — e a /list não devolvia a
 * reação do usuário. No viewer, o destaque só existia por 1,2s (animação) e sumia.
 *
 * Fix: coluna social_story_likes.emoji (migration); /react grava o emoji; /list devolve
 * myReaction (o emoji do próprio usuário); o StoryViewer inicializa/fixa esse destaque.
 */
const react = readFileSync('src/app/api/social/stories/react/route.ts', 'utf8')
const list = readFileSync('src/app/api/social/stories/list/route.ts', 'utf8')
const viewer = readFileSync('src/components/stories/StoryViewer.tsx', 'utf8')
const migration = readFileSync('supabase/migrations/20260721030000_social_story_likes_emoji.sql', 'utf8')

describe('persistência da reação de story', () => {
  it('a migration adiciona a coluna emoji', () => {
    expect(migration).toMatch(/ALTER TABLE public\.social_story_likes/i)
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS emoji/i)
  })

  it('a rota /react grava o emoji no upsert', () => {
    expect(react).toMatch(/upsert\(\{\s*story_id:\s*storyId,\s*user_id:\s*auth\.user\.id,\s*emoji\s*\}/)
  })

  it('a /list seleciona o emoji e devolve myReaction do próprio usuário', () => {
    expect(list).toMatch(/select\('story_id, user_id, emoji'\)/)
    expect(list).toMatch(/myReactionByStory/)
    expect(list).toMatch(/myReaction:\s*myReactionByStory\.get\(s\.id\)/)
  })

  it('o viewer inicializa e FIXA a reação (destaque por myReaction, não só o pop de 1,2s)', () => {
    expect(viewer).toMatch(/setMyReaction\(mine \|\| null\)/)
    expect(viewer).toMatch(/myReaction === emoji \? 'bg-yellow-500\/20/)
  })
})
