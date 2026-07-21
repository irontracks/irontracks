import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Regressão (reportado pelo dono): ao acabar os stories de um usuário, o viewer FECHAVA em vez
 * de passar pro próximo usuário — tinha que abrir cada um manualmente. Pedido: igual Instagram,
 * passar os usuários automaticamente.
 *
 * Causa: o StoryViewer só conhecia UM grupo (um autor). No fim (idx >= stories.length) chamava
 * onClose(). A StoriesBar tinha a fila de usuários (`ordered`) mas passava só currentGroup.
 *
 * Fix: StoryViewer ganhou onNextUser/onPrevUser; goNext tenta o próximo usuário antes de fechar;
 * as zonas de toque (esquerda/direita) cruzam a fronteira de usuário. A StoriesBar computa o
 * próximo/anterior em `ordered` e remonta o viewer por usuário (key={authorId}).
 */
const viewer = readFileSync('src/components/stories/StoryViewer.tsx', 'utf8')
const bar = readFileSync('src/components/dashboard/StoriesBar.tsx', 'utf8')

describe('StoryViewer — auto-advance entre usuários', () => {
  it('no fim tenta o PRÓXIMO usuário antes de fechar', () => {
    expect(viewer).toMatch(/onNextUser\s*\?\s*onNextUser\(\)\s*:\s*false/)
    expect(viewer).toMatch(/if\s*\(!advanced/)
  })

  it('as zonas de toque usam goPrev/goNext (cruzam a fronteira de usuário)', () => {
    expect(viewer).toMatch(/onClick=\{goPrev\}/)
    expect(viewer).toMatch(/onClick=\{goNext\}/)
    // não pode ter voltado ao setIdx inline que travava em 0 / no último
    expect(viewer).not.toMatch(/onClick=\{\(\) => setIdx\(\(v\) => Math\.max\(0, v - 1\)\)\}/)
  })
})

describe('StoriesBar — fila de usuários', () => {
  it('computa próximo/anterior usuário em `ordered`', () => {
    expect(bar).toMatch(/goNextUser/)
    expect(bar).toMatch(/goPrevUser/)
    expect(bar).toMatch(/setOpenAuthorId\(list\[i \+ 1\]\.authorId\)/)
  })

  it('remonta o viewer por usuário (key=authorId) e passa os callbacks', () => {
    expect(bar).toMatch(/key=\{currentGroup\.authorId\}/)
    expect(bar).toMatch(/onNextUser=\{goNextUser\}/)
    expect(bar).toMatch(/onPrevUser=\{goPrevUser\}/)
  })
})
