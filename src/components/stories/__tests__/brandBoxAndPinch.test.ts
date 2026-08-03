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
  snapBrandToCenter,
  snapWorkoutOffset,
  BRAND_SNAP_THRESHOLD,
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

describe('alinhamento do traçado com a tinta do logo', () => {
  const t = DEFAULT_STORY_TEMPLATE

  it('devolve o deslocamento da âncora até o canto do traçado', () => {
    // Sem `dx`/`dy` a caixa era ancorada no ponto de DESENHO. Com
    // `textBaseline='top'` esse ponto é o topo da em-box, e as maiúsculas começam
    // abaixo dele — sobrava um vão visível acima do logo. (2ª rodada do relato do
    // dono, 03/08/2026: "ainda não está totalmente alinhado")
    const box = measureBrandBox(t, 1)
    expect(typeof box.dx).toBe('number')
    expect(typeof box.dy).toBe('number')
    // A folga puxa o traçado para fora da tinta, nunca para dentro.
    expect(box.dx).toBeLessThanOrEqual(0)
  })

  it('o deslocamento acompanha a escala, como o resto da caixa', () => {
    const base = measureBrandBox(t, 1)
    const big = measureBrandBox(t, 2)
    expect(big.dx).toBeCloseTo(base.dx * 2, 5)
    expect(big.dy).toBeCloseTo(base.dy * 2, 5)
  })

  it('o hit-test usa o MESMO retângulo do traçado', () => {
    // Divergir aqui faz o usuário mirar num lugar e acertar outro.
    const src = readFileSync('src/components/storyComposerUtils.ts', 'utf8')
    expect(src).toMatch(/const x0 = BRAND_BASE_X \+ b\.x \+ box\.dx/)
    expect(src).toMatch(/const y0 = BRAND_BASE_Y \+ b\.y \+ box\.dy/)
  })

  it('a alça não mistura px de tela com % de canvas', () => {
    // `marginLeft/-Top: -6px` eram pixels de TELA somados a dimensões em % do
    // CANVAS: na preview (~300px exibindo 720) valiam 14,4px de canvas.
    const src = readFileSync('src/components/stories/BrandDragHandle.tsx', 'utf8')
    expect(src, 'voltou a usar recuo em px de tela').not.toMatch(/margin(Left|Top):\s*'-?\d+px'/)
    expect(src).toMatch(/box\.dx/)
    expect(src).toMatch(/box\.dy/)
  })
})

describe('guias de alinhamento (padrão Instagram)', () => {
  const t = DEFAULT_STORY_TEMPLATE
  const box = measureBrandBox(t, 1)

  /** Offset que põe o centro da marca exatamente no centro do canvas. */
  const centeredOffset = () => ({
    x: CANVAS_W / 2 - (BRAND_BASE_X + box.dx + box.w / 2),
    y: CANVAS_H / 2 - (BRAND_BASE_Y + box.dy + box.h / 2),
  })

  it('gruda no centro quando chega perto, nos dois eixos', () => {
    const c = centeredOffset()
    // 5px fora em cada eixo — dentro do limiar.
    const r = snapBrandToCenter({ x: c.x + 5, y: c.y - 5 }, box)
    expect(r.snappedX).toBe(true)
    expect(r.snappedY).toBe(true)
    expect(r.offset.x).toBeCloseTo(c.x, 4)
    expect(r.offset.y).toBeCloseTo(c.y, 4)
  })

  it('NÃO gruda longe do centro — o guia não pode sequestrar o arrasto', () => {
    const c = centeredOffset()
    const r = snapBrandToCenter({ x: c.x + 200, y: c.y + 200 }, box)
    expect(r.snappedX).toBe(false)
    expect(r.snappedY).toBe(false)
    expect(r.offset.x).toBeCloseTo(c.x + 200, 4)
  })

  it('os eixos são independentes — centralizar na largura não força a altura', () => {
    const c = centeredOffset()
    const r = snapBrandToCenter({ x: c.x + 3, y: c.y + 120 }, box)
    expect(r.snappedX).toBe(true)
    expect(r.snappedY).toBe(false)
    expect(r.offset.y).toBeCloseTo(c.y + 120, 4)
  })

  it('o limiar é a fronteira: dentro gruda, fora não', () => {
    const c = centeredOffset()
    const dentro = snapBrandToCenter({ x: c.x + BRAND_SNAP_THRESHOLD - 1, y: c.y }, box)
    const fora = snapBrandToCenter({ x: c.x + BRAND_SNAP_THRESHOLD + 2, y: c.y }, box)
    expect(dentro.snappedX).toBe(true)
    expect(fora.snappedX).toBe(false)
  })

  it('mede pelo CENTRO da tinta, não pela âncora', () => {
    // Se usasse a âncora, o "centro" ficaria meia-caixa deslocado e a linha
    // apareceria com o logo visivelmente fora do eixo.
    const c = centeredOffset()
    const r = snapBrandToCenter(c, box)
    const centerX = BRAND_BASE_X + r.offset.x + box.dx + box.w / 2
    expect(centerX).toBeCloseTo(CANVAS_W / 2, 4)
  })

  it('entrada inválida não quebra o arrasto', () => {
    const r = snapBrandToCenter(null, box)
    expect(Number.isFinite(r.offset.x)).toBe(true)
    expect(Number.isFinite(r.offset.y)).toBe(true)
  })
})

describe('fiação dos guias', () => {
  it('o hook aplica o snap e vibra só na TRANSIÇÃO', () => {
    const src = readFileSync('src/components/stories/useStoryComposer.ts', 'utf8')
    expect(src).toMatch(/snapBrandToCenter\(raw, box\)/)
    // Vibrar a cada move faria o aparelho tremer sem parar dentro da faixa.
    expect(src).toMatch(/snap\.snappedX && !prev\.x/)
    expect(src).toMatch(/triggerHaptic\('light'\)/)
  })

  it('a linha some ao soltar — é feedback de arrasto, não layout', () => {
    const src = readFileSync('src/components/stories/useStoryComposer.ts', 'utf8')
    const at = src.indexOf('const onBrandPointerUp = useCallback')
    const up = src.slice(at, at + 900)
    expect(up).toMatch(/setAlignGuides\(\{ x: false, y: false \}\)/)
  })

  it('o guia não captura pointer — senão mataria o arrasto que o criou', () => {
    const src = readFileSync('src/components/stories/AlignmentGuides.tsx', 'utf8')
    expect(src).toMatch(/pointer-events-none/)
  })

  it('os três composers mostram o guia', () => {
    for (const f of [
      'src/components/StoryComposer.tsx',
      'src/components/NutritionStoryComposer.tsx',
      'src/components/CardioStoryComposer.tsx',
    ]) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).toMatch(/<AlignmentGuides x=\{alignGuides\.x\} y=\{alignGuides\.y\} \/>/)
    }
  })
})

describe('guias do BLOCO (a parte de baixo)', () => {
  it('gruda no eixo original quando chega perto', () => {
    // O relato: as linhas só apareciam no IRONTRACKS. O bloco é arrastado pelo
    // overlay de gesto, que não tinha snap nenhum.
    const r = snapWorkoutOffset(6, -5)
    expect(r.snappedX).toBe(true)
    expect(r.snappedY).toBe(true)
    expect(r.offsetX).toBe(0)
    expect(r.offsetY).toBe(0)
  })

  it('NÃO gruda longe — arrastar de propósito continua livre', () => {
    const r = snapWorkoutOffset(150, -200)
    expect(r.snappedX).toBe(false)
    expect(r.snappedY).toBe(false)
    expect(r.offsetX).toBe(150)
    expect(r.offsetY).toBe(-200)
  })

  it('os eixos são independentes', () => {
    const r = snapWorkoutOffset(3, 180)
    expect(r.snappedX).toBe(true)
    expect(r.offsetX).toBe(0)
    expect(r.snappedY).toBe(false)
    expect(r.offsetY).toBe(180)
  })

  it('usa o mesmo limiar da marca — um app, um comportamento', () => {
    expect(snapWorkoutOffset(BRAND_SNAP_THRESHOLD - 1, 0).snappedX).toBe(true)
    expect(snapWorkoutOffset(BRAND_SNAP_THRESHOLD + 2, 0).snappedX).toBe(false)
  })

  it('entrada inválida não trava o arrasto', () => {
    const r = snapWorkoutOffset(NaN, NaN)
    expect(Number.isFinite(r.offsetX)).toBe(true)
    expect(Number.isFinite(r.offsetY)).toBe(true)
  })

  it('o hook aplica o snap no pan do bloco', () => {
    const src = readFileSync('src/components/stories/useStoryComposer.ts', 'utf8')
    expect(src).toMatch(/snapWorkoutOffset\(raw\.offsetX, raw\.offsetY\)/)
  })

  it('só o eixo X acende linha no bloco — a horizontal mentiria', () => {
    // A altura de repouso do bloco é a parte de baixo do story, não o meio: a
    // linha central ali apontaria um alinhamento que não existe.
    const src = readFileSync('src/components/stories/useStoryComposer.ts', 'utf8')
    expect(src).toMatch(/const next = \{ x: snap\.snappedX, y: false \}/)
  })

  it('as linhas somem ao terminar o arrasto do bloco', () => {
    const src = readFileSync('src/components/stories/useStoryComposer.ts', 'utf8')
    const at = src.indexOf('const onWorkoutTouchEnd')
    expect(src.slice(at, at + 400)).toMatch(/setAlignGuides\(\{ x: false, y: false \}\)/)
  })
})
