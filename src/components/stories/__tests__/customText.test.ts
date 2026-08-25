import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

import {
  CUSTOM_TEXT_BASE_X,
  CUSTOM_TEXT_BASE_Y,
  CUSTOM_TEXT_MAX_CHARS,
  clampCustomText,
  customTextMaxWidth,
  customTextOverflows,
  measureCustomTextBox,
  wrapCustomText,
} from '../customText'
import { CANVAS_H, CANVAS_W, SAFE_SIDE } from '../../storyComposerUtils'
import { DEFAULT_STORY_TEMPLATE } from '../storyTemplates'

/**
 * Legenda livre do usuário no Story.
 *
 * Pedido do dono (03/08/2026): escrever algo que saia junto do treino, na
 * tipografia do template — "assim o vídeo ou foto já vai 100% personalizado".
 *
 * ⚠️ Como no guard da marca: jsdom não implementa `canvas.getContext('2d')`, então
 * `measureCustomTextBox` cai no caminho vazio e a MEDIÇÃO real não é exercitada
 * aqui. `wrapCustomText` é testado com um ctx falso, que mede de forma
 * determinística — o que se prova é o ALGORITMO de quebra, não o rendering.
 */

/** ctx mínimo: largura proporcional ao número de caracteres. */
const fakeCtx = (charW = 10) => ({
  measureText: (s: string) => ({ width: Array.from(String(s)).length * charW }),
}) as unknown as CanvasRenderingContext2D

describe('clampCustomText', () => {
  it('corta no teto', () => {
    const long = 'a'.repeat(CUSTOM_TEXT_MAX_CHARS + 100)
    expect(Array.from(clampCustomText(long)).length).toBe(CUSTOM_TEXT_MAX_CHARS)
  })

  it('não parte caractere multibyte no meio', () => {
    // Emoji ocupa 2 code units: `slice` cru sobre a string quebraria o par e
    // deixaria um caractere inválido no fim.
    const emojis = '💪'.repeat(CUSTOM_TEXT_MAX_CHARS + 10)
    const out = clampCustomText(emojis)
    expect(Array.from(out).length).toBe(CUSTOM_TEXT_MAX_CHARS)
    expect(out).not.toContain('�')
  })

  it('entrada inválida vira string vazia', () => {
    for (const bad of [null, undefined, 0, {}]) {
      expect(typeof clampCustomText(bad)).toBe('string')
    }
  })
})

describe('wrapCustomText', () => {
  const ctx = fakeCtx(10) // 10px por caractere

  it('quebra na largura disponível', () => {
    const lines = wrapCustomText(ctx, 'aaa bbb ccc ddd', 100) // 10 chars por linha
    expect(lines.length).toBeGreaterThan(1)
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(10)
  })

  it('respeita as quebras que o usuário digitou', () => {
    const lines = wrapCustomText(ctx, 'um\ndois', 1000)
    expect(lines).toEqual(['um', 'dois'])
  })

  it('fatia palavra maior que a linha inteira', () => {
    // Sem isso um link colado vazaria para fora da área segura — justamente o que
    // o recorte do Instagram come.
    const lines = wrapCustomText(ctx, 'A'.repeat(35), 100)
    expect(lines.length).toBeGreaterThan(1)
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(10)
  })

  it('descarta linhas vazias sobrando no fim', () => {
    // Enter sobrando inflaria a caixa da alça sem nada dentro.
    const lines = wrapCustomText(ctx, 'oi\n\n\n', 1000)
    expect(lines).toEqual(['oi'])
  })

  it('texto vazio não gera linha', () => {
    expect(wrapCustomText(ctx, '', 1000)).toEqual([])
    expect(wrapCustomText(ctx, '   ', 1000)).toEqual([])
  })

  it('largura inválida não trava a quebra', () => {
    expect(() => wrapCustomText(ctx, 'teste', 0)).not.toThrow()
    expect(() => wrapCustomText(ctx, 'teste', NaN)).not.toThrow()
  })
})

describe('geometria', () => {
  it('a largura útil respeita as margens seguras dos dois lados', () => {
    expect(customTextMaxWidth()).toBe(CANVAS_W - SAFE_SIDE * 2)
  })

  it('as constantes de canvas batem com a fonte original', () => {
    // `customText.ts` REPETE CANVAS_W/H e SAFE_SIDE de propósito: importar de
    // `storyComposerUtils` criaria ciclo (aquele módulo importa o desenho daqui) e
    // as constantes, lidas no topo, chegariam `undefined` — CUSTOM_TEXT_BASE_Y
    // viraria NaN e a legenda sumiria SEM erro. Este guard trava a igualdade.
    const src = readFileSync('src/components/stories/customText.ts', 'utf8')
    expect(src).toMatch(new RegExp(`const CANVAS_W = ${CANVAS_W}\\b`))
    expect(src).toMatch(new RegExp(`const CANVAS_H = ${CANVAS_H}\\b`))
    expect(src).toMatch(new RegExp(`const SAFE_SIDE = ${SAFE_SIDE}\\b`))
    expect(src, 'voltou a importar de storyComposerUtils — ciclo').not.toMatch(/from '\.\.\/storyComposerUtils'/)
  })

  it('a âncora fica dentro do canvas e na faixa livre', () => {
    expect(CUSTOM_TEXT_BASE_X).toBe(SAFE_SIDE)
    expect(CUSTOM_TEXT_BASE_Y).toBeGreaterThan(0)
    expect(CUSTOM_TEXT_BASE_Y).toBeLessThan(CANVAS_H)
    expect(Number.isFinite(CUSTOM_TEXT_BASE_Y)).toBe(true)
  })

  it('texto vazio não produz caixa — a alça some', () => {
    const box = measureCustomTextBox(DEFAULT_STORY_TEMPLATE, '')
    expect(box.lines).toEqual([])
    expect(box.w).toBe(0)
  })
})

describe('aviso de área segura', () => {
  const safeBottomY = CANVAS_H - 200

  it('não avisa quando não há texto', () => {
    const box = { lines: [], w: 0, h: 0, dx: 0, dy: 0 }
    expect(customTextOverflows(box, { x: 0, y: 0 }, safeBottomY)).toBe(false)
  })

  it('avisa quando a legenda passa da área segura', () => {
    const box = { lines: ['a', 'b'], w: 300, h: 200, dx: 0, dy: 0 }
    expect(customTextOverflows(box, { x: 0, y: 600 }, safeBottomY)).toBe(true)
  })

  it('não avisa quando cabe', () => {
    const box = { lines: ['a'], w: 300, h: 50, dx: 0, dy: 0 }
    expect(customTextOverflows(box, { x: 0, y: 0 }, safeBottomY)).toBe(false)
  })
})

describe('fiação da legenda', () => {
  it('o EXPORT desenha a legenda — senão ela some do arquivo salvo', () => {
    // O bug que isto trava: a legenda aparecia na prévia e sumia no arquivo. O
    // mesmo caminho já tinha esquecido `brandScale`.
    const src = readFileSync('src/components/stories/useStoryComposer.ts', 'utf8')
    expect(src).toMatch(/brandScale: bs, customText: ct, customTextOffset: cto/)
  })

  it('o export lê pelos REFS, não pelo state', () => {
    const src = readFileSync('src/components/stories/useStoryComposer.ts', 'utf8')
    expect(src).toMatch(/const ct = customTextRef\.current/)
    expect(src).toMatch(/const cto = customTextOffsetRef\.current/)
  })

  it('os três renderers desenham a legenda por último', () => {
    for (const f of [
      'src/components/storyComposerUtils.ts',
      'src/components/stories/nutritionStory.ts',
      'src/components/stories/cardioStory.ts',
    ]) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).toMatch(/drawCustomTextLayer\(ctx, template/)
    }
  })

  it('o teto é aplicado no ESTADO, não só no input', () => {
    // `maxLength` no textarea não cobre colar via API nem estado vindo de fora.
    const src = readFileSync('src/components/stories/useStoryComposer.ts', 'utf8')
    expect(src).toMatch(/setCustomTextState\(clampCustomText\(raw\)\)/)
  })

  it('a alça some quando não há texto', () => {
    const src = readFileSync('src/components/stories/CustomTextDragHandle.tsx', 'utf8')
    expect(src).toMatch(/if \(!box\.lines\.length\) return null/)
  })

  it('a alça não mistura px de tela com % de canvas', () => {
    const src = readFileSync('src/components/stories/CustomTextDragHandle.tsx', 'utf8')
    expect(src).not.toMatch(/margin(Left|Top):\s*'-?\d+px'/)
  })

  it('os três composers mostram o campo e a alça', () => {
    for (const f of [
      'src/components/StoryComposer.tsx',
      'src/components/NutritionStoryComposer.tsx',
      'src/components/CardioStoryComposer.tsx',
    ]) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).toMatch(/<CustomTextPanel/)
      expect(src, f).toMatch(/<CustomTextDragHandle/)
      // Presença, não POSIÇÃO. A versão anterior casava
      // `customText, customTextOffset })` — exigindo que a legenda fosse o
      // ÚLTIMO argumento da chamada. Acrescentar qualquer campo novo ao draw
      // (foi o `timeOffset`, em 25/08/2026) reprovava um guard que não tem
      // nada a ver com ordem de argumento. O que importa é a legenda CHEGAR
      // ao renderer.
      // TODAS as chamadas, não a primeira: cada composer tem um wrapper com
      // spread (`{ ...args, content }`) antes da chamada completa, e casar a
      // primeira media o wrapper. Cada nome também é diferente — drawStory,
      // drawNutritionStory, drawCardioStory —, então nada de nome fixo.
      const chamadas = [...src.matchAll(/draw\w*Story\(\{[\s\S]{0,600}/g)].map((m) => m[0])
      expect(chamadas.length, `${f}: nenhuma chamada draw*Story encontrada`).toBeGreaterThan(0)
      const chamada = chamadas.join('\n')
      expect(chamada, `${f}: customText precisa chegar ao renderer`).toMatch(/\bcustomText\b/)
      expect(chamada, `${f}: customTextOffset precisa chegar ao renderer`).toMatch(/\bcustomTextOffset\b/)
    }
  })
})

describe('a legenda NÃO desfaz o transform do bloco', () => {
  /**
   * BUG pego na conferência no aparelho (03/08/2026): a alça tracejada aparecia no
   * lugar certo e o TEXTO não aparecia.
   *
   * Causa: `drawCustomTextLayer` aplicava a inversa do transform do bloco, como
   * `enterBrandSpace` faz. Só que a marca é desenhada DENTRO daquele transform e a
   * legenda não — os renderers a chamam depois do `ctx.restore()` que o encerra.
   * A inversa deslocava o texto pelo NEGATIVO do pan do bloco: com o bloco
   * arrastado, a legenda saía da tela enquanto a alça (HTML) ficava parada.
   */
  const src = readFileSync('src/components/stories/customText.ts', 'utf8')
  const fn = src.slice(src.indexOf('export const drawCustomTextLayer'))

  it('não aplica a inversa do zoom do bloco', () => {
    expect(fn, 'voltou a inverter a escala do bloco').not.toMatch(/ctx\.scale\(1 \/ s, 1 \/ s\)/)
  })

  it('não aplica a inversa do pan do bloco', () => {
    expect(fn, 'voltou a inverter o pan do bloco').not.toMatch(/ctx\.translate\(-offX, -offY\)/)
  })

  it('aplica apenas o offset próprio da legenda', () => {
    expect(fn).toMatch(/ctx\.translate\(Number\(offset\?\.x\) \|\| 0, Number\(offset\?\.y\) \|\| 0\)/)
  })

  it('nenhum renderer passa mais o workoutTransform para a legenda', () => {
    for (const f of [
      'src/components/storyComposerUtils.ts',
      'src/components/stories/nutritionStory.ts',
      'src/components/stories/cardioStory.ts',
    ]) {
      const s = readFileSync(f, 'utf8')
      expect(s, f).not.toMatch(/drawCustomTextLayer\([^)]*customTextOffset,\s*(workoutTransform|wt)\)/)
    }
  })
})
