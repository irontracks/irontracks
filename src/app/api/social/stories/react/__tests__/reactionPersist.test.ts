import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Regressão (reportado pelo dono): as reações de story "não fixavam". Causa: a rota /react só
 * gravava o LIKE (story_id, user_id) — o EMOJI não era persistido — e a /list não devolvia a
 * reação do usuário. No viewer, o destaque só existia por 1,2s (animação) e sumia.
 *
 * Fix (jul/2026): coluna social_story_likes.emoji; /react grava o emoji; /list devolve
 * myReaction (o emoji do próprio usuário); o StoryViewer inicializa/fixa esse destaque.
 *
 * ATUALIZADO em 05/08/2026: o emoji saiu da coluna e virou TABELA
 * (`social_story_reactions`, migration `split_story_reactions_from_likes`). A
 * gambiarra de guardar a reação na linha de curtida causava três bugs — reagir
 * marcava curtida, descurtir apagava a reação, e trocar de emoji batia na RLS
 * (aquela tabela não tem policy de UPDATE) com 403. O que este arquivo protege
 * continua sendo o mesmo: a reação PERSISTE e volta na listagem.
 */
const react = readFileSync('src/app/api/social/stories/react/route.ts', 'utf8')
const list = readFileSync('src/app/api/social/stories/list/route.ts', 'utf8')
const viewer = readFileSync('src/components/stories/StoryViewer.tsx', 'utf8')


describe('persistência da reação de story', () => {
  it('a rota /react grava o emoji na tabela de REAÇÕES', () => {
    expect(react).toMatch(/from\('social_story_reactions'\)/)
    expect(react).toMatch(/upsert\(\{\s*story_id:\s*storyId,\s*user_id:\s*auth\.user\.id,\s*emoji/)
  })

  it('a /list lê a reação da tabela própria e devolve myReaction', () => {
    expect(list).toMatch(/from\('social_story_reactions'\)[\s\S]*select\('story_id, emoji'\)/)
    expect(list).toMatch(/myReactionByStory/)
    expect(list).toMatch(/myReaction:\s*myReactionByStory\.get\(s\.id\)/)
  })

  it('o viewer inicializa e FIXA a reação (destaque por myReaction, não só o pop de 1,2s)', () => {
    expect(viewer).toMatch(/setMyReaction\(mine \|\| null\)/)
    expect(viewer).toMatch(/myReaction === emoji \? 'bg-yellow-500\/20/)
  })
})
