import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Regressão (reportado pelo dono, com print): no compositor de Story da Nutrição, o modo
 * "Resumo do dia" (mode='day') NÃO oferecia anexar foto/vídeo — só os estilos de cor —
 * enquanto o modo "Refeição" (mode='meal') já permitia. A infra de mídia (input
 * accept="image/*,video/*", preview de vídeo, trimmer, export em vídeo) já existia no
 * componente e no hook useStoryComposer; o bloco de upload é que estava gateado por
 * `mode === 'meal'`. O fix removeu o gate — mídia vale nos dois modos, igual ao compositor
 * do Store.
 */
// Source CRU de propósito: o atributo accept="image/*,video/*" tem "/*", que um
// stripComments ingênuo trataria como início de comentário de bloco e apagaria o trecho.
const src = readFileSync('src/components/NutritionStoryComposer.tsx', 'utf8')

describe('NutritionStoryComposer — mídia nos dois modos', () => {
  it('oferece anexar foto E vídeo (input accept image + video)', () => {
    expect(src).toMatch(/accept="image\/\*,video\/\*"/)
    // O RÓTULO muda com o produto (era "ADICIONAR FOTO/VÍDEO", virou
    // "PONHA SUA FOTO OU VÍDEO" quando o story passou a pedir a foto). O que
    // este guard protege é o par rótulo-de-adicionar × rótulo-de-trocar, não a
    // redação — guard que trava wording é afrouxado na primeira semana.
    expect(src).toMatch(/backgroundImage \|\| isVideo \? 'TROCAR MÍDIA' : '[^']+'/)
  })

  it('o bloco de upload NÃO é mais gateado por mode === meal', () => {
    // O gate ficava logo antes do <label> do Upload. Se voltar, o "Resumo do dia" perde a mídia.
    const uploadIdx = src.indexOf('ADICIONAR FOTO/VÍDEO')
    const before = src.slice(Math.max(0, uploadIdx - 400), uploadIdx)
    expect(before).not.toMatch(/mode === ['"]meal['"]\s*&&/)
  })

  it('mantém o preview de vídeo e o trimmer (export em vídeo)', () => {
    expect(src).toMatch(/ref=\{videoRef\}/)
    expect(src).toMatch(/setShowTrimmer/)
  })
})
