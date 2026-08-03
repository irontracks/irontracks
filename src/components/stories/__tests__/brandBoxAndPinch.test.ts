import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

import {
  BRAND_BASE_X,
  BRAND_BASE_Y,
  BRAND_SCALE_MAX,
  BRAND_SCALE_MIN,
  CANVAS_H,
  CANVAS_W,
  clampBrandScale,
  isPointOverBrand,
  measureBrandBox,
} from '../../storyComposerUtils'
import { DEFAULT_STORY_TEMPLATE } from '../storyTemplates'

/**
 * Marca (IRONTRACKS) no editor de story — dois defeitos relatados juntos, com print
 * (03/08/2026):
 *
 * 1. "o traçado em volta do IRONTRACKS está fora" — a alça de arrasto usava uma
 *    caixa 380×66 CHUMBADA, enquanto a largura real do logo depende da fonte do
 *    template e do separador (`brandDivider`: '', ' · ', ' — ', ' / ').
 * 2. "quando pinço o IRONTRACKS ainda aumenta tudo" — a caixa da marca é pequena,
 *    então o segundo dedo caía fora dela, no overlay de gesto (z-20), que via dois
 *    toques e escalava o BLOCO inteiro.
 *
 * As duas têm a mesma raiz: ninguém sabia a caixa real da marca. `measureBrandBox`
 * resolve as duas — desenha o traçado e decide de quem é a pinça.
 *
 * ⚠️ LIMITE DESTE ARQUIVO: jsdom não implementa `canvas.getContext('2d')`, então
 * `measureBrandBox` cai aqui no seu FALLBACK — a medição real (`ctx.measureText`
 * com a fonte do template) NÃO é exercitada. O que estes casos provam é a lógica
 * em volta: proporcionalidade à escala, hit-test, clamps e a fiação. Que o traçado
 * abraça o logo no aparelho é conferência visual, não teste.
 */

/** Rect de preview típico: o canvas 720×1280 exibido a 360×640 (metade). */
const RECT = { left: 0, top: 0, width: 360, height: 640 } as DOMRect

/** Canvas px → tela px, para montar pontos de toque plausíveis. */
const toScreen = (cx: number, cy: number) => ({
  x: RECT.left + cx * (RECT.width / CANVAS_W),
  y: RECT.top + cy * (RECT.height / CANVAS_H),
})

describe('measureBrandBox', () => {
  it('devolve uma caixa utilizável', () => {
    const box = measureBrandBox(DEFAULT_STORY_TEMPLATE)
    expect(box.w).toBeGreaterThan(0)
    expect(box.h).toBeGreaterThan(0)
  })

  it('cresce junto com a escala da marca — senão o traçado descola ao pinçar', () => {
    const base = measureBrandBox(DEFAULT_STORY_TEMPLATE, 1)
    const big = measureBrandBox(DEFAULT_STORY_TEMPLATE, 2)
    expect(big.w).toBeCloseTo(base.w * 2, 5)
    expect(big.h).toBeCloseTo(base.h * 2, 5)
  })

  it('escala inválida não encolhe a caixa a zero', () => {
    for (const bad of [0, -1, NaN, undefined as unknown as number]) {
      const box = measureBrandBox(DEFAULT_STORY_TEMPLATE, bad)
      expect(box.w).toBeGreaterThan(0)
    }
  })
})

describe('clampBrandScale', () => {
  it('mantém a marca como assinatura, não como conteúdo', () => {
    expect(clampBrandScale(10)).toBe(BRAND_SCALE_MAX)
    expect(clampBrandScale(0.1)).toBe(BRAND_SCALE_MIN)
    expect(clampBrandScale(1.5)).toBe(1.5)
  })

  it('valor ausente ou inválido volta a 1, sem quebrar o desenho', () => {
    for (const bad of [null, undefined, NaN, 0, -2, 'x' as unknown as number]) {
      expect(clampBrandScale(bad)).toBe(1)
    }
  })
})

describe('isPointOverBrand — de quem é a pinça', () => {
  const t = DEFAULT_STORY_TEMPLATE
  const box = measureBrandBox(t, 1)

  it('ponto sobre o logo pertence à MARCA', () => {
    const p = toScreen(BRAND_BASE_X + box.w / 2, BRAND_BASE_Y + box.h / 2)
    expect(isPointOverBrand(p.x, p.y, RECT, t, { x: 0, y: 0 }, 1)).toBe(true)
  })

  it('ponto no meio do story pertence ao BLOCO — a pinça geral não pode ser roubada', () => {
    const p = toScreen(CANVAS_W / 2, CANVAS_H / 2)
    expect(isPointOverBrand(p.x, p.y, RECT, t, { x: 0, y: 0 }, 1)).toBe(false)
  })

  it('logo abaixo da marca já é do bloco', () => {
    const p = toScreen(BRAND_BASE_X + 10, BRAND_BASE_Y + box.h + 40)
    expect(isPointOverBrand(p.x, p.y, RECT, t, { x: 0, y: 0 }, 1)).toBe(false)
  })

  it('acompanha a marca quando ela é ARRASTADA', () => {
    const offset = { x: 120, y: 300 }
    const dentro = toScreen(BRAND_BASE_X + offset.x + 10, BRAND_BASE_Y + offset.y + 10)
    expect(isPointOverBrand(dentro.x, dentro.y, RECT, t, offset, 1)).toBe(true)
    // O lugar ANTIGO da marca deixa de responder.
    const antigo = toScreen(BRAND_BASE_X + 10, BRAND_BASE_Y + 10)
    expect(isPointOverBrand(antigo.x, antigo.y, RECT, t, offset, 1)).toBe(false)
  })

  it('a área de acerto cresce com a marca ampliada', () => {
    // Ponto que só existe dentro da caixa quando a marca está 2×.
    const p = toScreen(BRAND_BASE_X + box.w * 1.5, BRAND_BASE_Y + 10)
    expect(isPointOverBrand(p.x, p.y, RECT, t, { x: 0, y: 0 }, 1)).toBe(false)
    expect(isPointOverBrand(p.x, p.y, RECT, t, { x: 0, y: 0 }, 2)).toBe(true)
  })

  it('sem rect ou sem template, não reivindica o gesto', () => {
    const p = toScreen(BRAND_BASE_X + 10, BRAND_BASE_Y + 10)
    expect(isPointOverBrand(p.x, p.y, null, t, { x: 0, y: 0 }, 1)).toBe(false)
    expect(isPointOverBrand(p.x, p.y, RECT, null, { x: 0, y: 0 }, 1)).toBe(false)
    expect(isPointOverBrand(p.x, p.y, { left: 0, top: 0, width: 0, height: 0 } as DOMRect, t, { x: 0, y: 0 }, 1)).toBe(false)
  })
})

describe('a fiação nos componentes', () => {
  it('a alça mede a marca em vez de usar caixa chumbada', () => {
    const src = readFileSync('src/components/stories/BrandDragHandle.tsx', 'utf8')
    expect(src).toMatch(/measureBrandBox\(template,\s*brandScale\)/)
    // Os números do bug. `380`/`66` de volta = traçado fora do lugar outra vez.
    expect(src, 'voltou a caixa chumbada').not.toMatch(/const BRAND_BOX_W = 380/)
  })

  it('o gesto sabe onde nasceu — senão a pinça da marca escala tudo de novo', () => {
    const src = readFileSync('src/components/stories/useStoryComposer.ts', 'utf8')
    expect(src).toMatch(/isPointOverBrand\(/)
    expect(src).toMatch(/mode:\s*onBrand\s*\?\s*'brand_pinch'\s*:\s*'pinch'/)
    // O modo da marca só pode mexer em brandScale.
    expect(src).toMatch(/g\.mode === 'brand_pinch'[\s\S]{0,400}setBrandScale\(/)
  })

  it('o overlay repassa o rect, sem o qual não dá para localizar o toque', () => {
    for (const f of [
      'src/components/StoryComposer.tsx',
      'src/components/NutritionStoryComposer.tsx',
      'src/components/CardioStoryComposer.tsx',
    ]) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).toMatch(/onWorkoutTouchStart\(\{ touches: Array\.from\(e\.touches\) \}, previewRef/)
      expect(src, f).toMatch(/brandScale=\{brandScale\}/)
    }
  })

  it('a escala da marca chega ao desenho nos três renderers', () => {
    for (const f of [
      'src/components/storyComposerUtils.ts',
      'src/components/stories/nutritionStory.ts',
      'src/components/stories/cardioStory.ts',
    ]) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).toMatch(/enterBrandSpace\(ctx, wt, bOff, brandScale\)/)
    }
  })
})
