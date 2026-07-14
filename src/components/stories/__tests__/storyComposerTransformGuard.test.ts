import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Guard do bug: o Story salvava SEMPRE no tamanho padrão, ignorando o zoom/posição
// que o usuário deixou. Causa: os callbacks de export (shareImage/postStory) são
// useCallback com deps enxutas (+ eslint-disable) e CONGELAVAM o closure com o
// workoutTransform INICIAL (scale 1, offset 0). O render de export precisa ler o
// transform por REF (valor atual), nunca pelo state capturado no closure.
const src = readFileSync(
  resolve(process.cwd(), 'src/components/stories/useStoryComposer.ts'),
  'utf8',
)

describe('useStoryComposer — export usa o transform ATUAL (guard)', () => {
  it('mantém um ref espelhando o workoutTransform', () => {
    expect(src).toContain('workoutTransformRef')
    expect(src).toContain('workoutTransformRef.current = workoutTransform')
  })

  it('renderComposite (usado pelo export) lê o transform pelo REF', () => {
    expect(src).toContain('const wt = workoutTransformRef.current')
    // e repassa esse valor ao renderer
    expect(src).toContain('workoutTransform: wt')
  })

  it('renderComposite NÃO passa mais o state cru (que vinha do closure velho)', () => {
    // Se alguém reverter para `template, workoutTransform })` dentro do render de
    // export, o zoom volta a ser ignorado no save.
    const renderBlock = src.slice(src.indexOf('const renderComposite'), src.indexOf('const renderVideoFrameAsJpeg'))
    expect(renderBlock).not.toContain('template, workoutTransform }')
  })
})
