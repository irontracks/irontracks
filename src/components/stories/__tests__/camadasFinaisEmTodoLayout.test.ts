import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORY_LAYOUTS, drawStory, type Metrics } from '@/components/storyComposerUtils'
import { DEFAULT_STORY_TEMPLATE } from '@/components/stories/storyTemplates'
import { DEFAULT_NUTRITION_TEMPLATE } from '@/components/stories/nutritionStoryTemplates'
import { drawMetricsStory } from '@/components/stories/metricsStory'
import { drawNutritionStory } from '@/components/stories/nutritionStory'
import { drawCardioStory } from '@/components/stories/cardioStory'

/**
 * A legenda do usuário (e o horário, e a marca) saem em TODO layout — e fora do
 * zoom/pan do bloco.
 *
 * Bug visto no simulador em 26/09/2026: no layout TREINO, digitar em "SUA
 * LEGENDA" mostrava só a caixa tracejada da alça, vazia. `drawStory` desenhava a
 * legenda na última linha da função, e o caminho do layout `workout` saía com
 * `return` antes de chegar lá — prévia e arquivo exportado (salvar/postar usam o
 * mesmo `drawStory`) sem o texto que o usuário acabou de escrever. A MESMA classe
 * já tinha pegado o horário em 25/08/2026 e foi corrigida só para ele.
 *
 * E o avesso, no mesmo arquivo: nos layouts Normal/Direita/Esquerda o horário
 * era desenhado ANTES do `restore` do bloco — com zoom, a pílula andava junto
 * com os números enquanto a alça (HTML) ficava onde deveria.
 *
 * Por isso o guard varre os layouts pela lista (`STORY_LAYOUTS`, mais os nomes
 * extintos que ainda podem estar em memória) e os quatro renderers de story, em
 * vez de fixar o caso `workout`: um layout novo que volte a sair cedo reprova
 * sozinho.
 *
 * jsdom não implementa canvas, então o ctx é falso — mas ele segue a matriz de
 * transform de verdade (save/restore/translate/scale), que é o que responde
 * "em que espaço essa tinta caiu?".
 */

type Matrix = [number, number, number, number, number, number]
type Tinta = { text: string; m: Matrix }

const IDENTIDADE: Matrix = [1, 0, 0, 1, 0, 0]

function ctxFalso() {
  let m: Matrix = [...IDENTIDADE]
  const pilha: Matrix[] = []
  const tintas: Tinta[] = []
  let restoresSemSave = 0

  const metodos: Record<string, (...args: never[]) => unknown> = {
    save: () => { pilha.push([...m]) },
    restore: () => {
      const topo = pilha.pop()
      if (topo) m = topo
      else restoresSemSave++
    },
    translate: (x: number, y: number) => {
      const [a, b, c, d, e, f] = m
      m = [a, b, c, d, e + a * x + c * y, f + b * x + d * y]
    },
    scale: (sx: number, sy: number) => {
      const [a, b, c, d, e, f] = m
      m = [a * sx, b * sx, c * sy, d * sy, e, f]
    },
    fillText: (text: string) => { tintas.push({ text: String(text), m: [...m] }) },
    measureText: (s: string) => {
      const width = Array.from(String(s)).length * 10
      return { width, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 5, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width }
    },
    createLinearGradient: () => ({ addColorStop: () => {} }),
  }

  const props: Record<string, unknown> = {}
  const ctx = new Proxy(props, {
    get: (_t, k: string) => (k in metodos ? metodos[k] : k in props ? props[k] : () => {}),
    set: (_t, k: string, v) => { props[k] = v; return true },
  }) as unknown as CanvasRenderingContext2D

  return {
    ctx,
    tintas,
    profundidade: () => pilha.length,
    matrizFinal: () => m,
    restoresSemSave: () => restoresSemSave,
  }
}

const esperaIdentidade = (m: Matrix, onde: string) => {
  IDENTIDADE.forEach((v, i) => {
    expect(m[i], `${onde}: matriz[${i}] = ${m[i]}`).toBeCloseTo(v, 6)
  })
}

const LEGENDA = 'LEGENDA DO DONO'
/** Zoom + pan do bloco ligados: é com eles que "fora do transform" tem como falhar. */
const ZOOM = { scale: 1.6, offsetX: 40, offsetY: -30 }

const METRICS: Metrics = {
  title: 'Upper A',
  date: '26/09/2026',
  volume: 12345,
  totalTime: 3900,
  kcal: 480,
  teamCount: 0,
  exercises: [
    { name: 'Supino reto', reps: '10', weight: '80 kg', totalReps: '40' },
    { name: 'Remada curvada', reps: '12', weight: '60 kg', totalReps: '48' },
  ],
} as Metrics

/** Os ids atuais e os EXTINTOS: layout antigo em memória cai no fallback. */
const LAYOUTS = [...STORY_LAYOUTS.map((l) => l.id), 'live', 'group', 'top-row']

let horaEsperada = ''

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-26T13:07:00.000Z'))
  horaEsperada = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
})

afterEach(() => {
  vi.useRealTimers()
})

/** O que vale para QUALQUER renderer de story: a legenda por último, sem zoom. */
function confereLegenda(r: ReturnType<typeof ctxFalso>, onde: string) {
  const daLegenda = r.tintas.filter((t) => t.text === LEGENDA)
  expect(daLegenda, `${onde}: legenda desenhada`).toHaveLength(1)
  esperaIdentidade(daLegenda[0].m, `${onde}: legenda fora do zoom do bloco`)
  // Nada do template pode cobri-la: é a última tinta da peça.
  expect(r.tintas[r.tintas.length - 1]?.text, `${onde}: legenda por último`).toBe(LEGENDA)
  // Todo save tem o seu restore — senão o frame seguinte herda o zoom.
  expect(r.profundidade(), `${onde}: save/restore equilibrados`).toBe(0)
  expect(r.restoresSemSave(), `${onde}: restore sem save`).toBe(0)
  esperaIdentidade(r.matrizFinal(), `${onde}: ctx devolvido limpo`)
}

describe('drawStory — camadas finais em TODO layout', () => {
  it('a varredura enxerga os layouts oferecidos (guard sem alvo não prova nada)', () => {
    expect(STORY_LAYOUTS.map((l) => l.id)).toContain('workout')
    expect(LAYOUTS.length).toBeGreaterThanOrEqual(4)
  })

  for (const layout of LAYOUTS) {
    describe(`layout "${layout}"`, () => {
      const desenhar = (workoutTransform = ZOOM) => {
        const r = ctxFalso()
        drawStory({
          ctx: r.ctx,
          canvasW: 720,
          canvasH: 1280,
          backgroundImage: null,
          metrics: METRICS,
          layout,
          template: DEFAULT_STORY_TEMPLATE,
          workoutTransform,
          customText: LEGENDA,
          customTextOffset: { x: 0, y: 0 },
        })
        return r
      }

      it('desenha a legenda do usuário, por último e fora do zoom do bloco', () => {
        confereLegenda(desenhar(), `drawStory/${layout}`)
      })

      it('desenha a legenda também sem zoom', () => {
        confereLegenda(desenhar({ scale: 1, offsetX: 0, offsetY: 0 }), `drawStory/${layout}/sem zoom`)
      })

      it('desenha o horário uma vez, fora do zoom do bloco (a alça dele não sabe do zoom)', () => {
        const r = desenhar()
        const hora = r.tintas.filter((t) => t.text === horaEsperada)
        expect(hora, `horário "${horaEsperada}"`).toHaveLength(1)
        esperaIdentidade(hora[0].m, `drawStory/${layout}: horário`)
      })

      it('desenha a marca uma vez, fora do zoom do bloco', () => {
        const r = desenhar()
        const marca = r.tintas.filter((t) => t.text === 'IRON')
        expect(marca).toHaveLength(1)
        esperaIdentidade(marca[0].m, `drawStory/${layout}: marca`)
      })
    })
  }
})

describe('os outros renderers de story também desenham a legenda', () => {
  const base = {
    canvasW: 720,
    canvasH: 1280,
    backgroundImage: null,
    workoutTransform: ZOOM,
    customText: LEGENDA,
    customTextOffset: { x: 0, y: 0 },
  }

  it('métricas', () => {
    const r = ctxFalso()
    drawMetricsStory({
      ...base,
      ctx: r.ctx,
      template: DEFAULT_STORY_TEMPLATE,
      content: {
        title: 'Aquisição',
        periodText: 'ÚLTIMOS 7 DIAS',
        hero: { label: 'CADASTROS', value: '12' },
        cards: [{ label: 'A', value: '1' }, { label: 'B', value: '2' }],
        rows: [{ label: 'Linha', value: '3' }],
      },
    })
    confereLegenda(r, 'drawMetricsStory')
  })

  it('nutrição — refeição, dia e período', () => {
    const conteudos = [
      { kind: 'meal', mealName: 'Almoço', calories: 700, protein: 50, carbs: 80, fat: 20, items: [{ label: 'Arroz', grams: 150 }] },
      { kind: 'day', dateText: '26/09', calories: 2200, goalCalories: 2500, protein: 150, carbs: 250, fat: 70, goalProtein: 160, goalCarbs: 280, goalFat: 80 },
      { kind: 'period', periodLabel: 'Semana', rangeText: '20 – 26 de set.', calories: 2100, goalCalories: 2500, protein: 140, carbs: 240, fat: 70, goalProtein: 160, goalCarbs: 280, goalFat: 80, loggedDays: 6, windowDays: 7 },
    ] as unknown as Parameters<typeof drawNutritionStory>[0]['content'][]
    for (const content of conteudos) {
      const r = ctxFalso()
      drawNutritionStory({ ...base, ctx: r.ctx, template: DEFAULT_NUTRITION_TEMPLATE, content })
      confereLegenda(r, `drawNutritionStory/${(content as { kind: string }).kind}`)
    }
  })

  it('cardio — com e sem rota', () => {
    for (const route of [[], [{ lat: -25.4, lng: -49.2 }, { lat: -25.41, lng: -49.21 }, { lat: -25.42, lng: -49.19 }]]) {
      const r = ctxFalso()
      drawCardioStory({
        ...base,
        ctx: r.ctx,
        template: DEFAULT_STORY_TEMPLATE,
        content: {
          activityType: 'running',
          dateText: '26/09/2026',
          distanceMeters: 5000,
          durationSeconds: 1800,
          paceMinKm: 6,
          caloriesEstimated: 350,
          route,
        },
      })
      confereLegenda(r, `drawCardioStory/${route.length} pontos`)
    }
  })
})
