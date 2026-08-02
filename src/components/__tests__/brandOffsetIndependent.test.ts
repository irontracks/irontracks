import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
    CANVAS_W,
    CANVAS_H,
    STORY_LAYOUTS,
    DEFAULT_LIVE_POSITIONS,
    BRAND_BASE_X,
    BRAND_BASE_Y,
    brandHandlePct,
    dragToBrandOffset,
    clampBrandOffset,
    drawStory,
    type Metrics,
} from '../storyComposerUtils'
import { drawNutritionStory } from '../stories/nutritionStory'
import { drawCardioStory } from '../stories/cardioStory'
import { DEFAULT_STORY_TEMPLATE } from '../stories/storyTemplates'

// A marca (IRON·TRACKS) é 100% independente do bloco: o arrasto/zoom geral move e
// redimensiona título/cards/tabela, e a marca NÃO acompanha. Já regrediu uma vez —
// o offset dela era aplicado DENTRO do transform geral, então diminuir os dados
// diminuía a marca junto. Os testes abaixo medem a MATRIZ efetiva no momento em
// que a marca é desenhada, que é o que o usuário enxerga.

type Mat = { a: number; b: number; c: number; d: number; e: number; f: number }
const IDENTITY: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

/** Mock de canvas que acumula a matriz (translate/scale/save/restore). */
const makeCtx = () => {
    let m: Mat = { ...IDENTITY }
    const stack: Mat[] = []
    const brandDraws: { text: string; x: number; y: number; m: Mat }[] = []
    const ctx = {
        get matrix() { return m },
        brandDraws,
        save: () => { stack.push({ ...m }) },
        restore: () => { const p = stack.pop(); if (p) m = p },
        translate: (x: number, y: number) => { m = { ...m, e: m.e + m.a * x + m.c * y, f: m.f + m.b * x + m.d * y } },
        scale: (sx: number, sy: number) => { m = { ...m, a: m.a * sx, b: m.b * sx, c: m.c * sy, d: m.d * sy } },
        fillText: (t: string, x: number, y: number) => {
            if (t === 'IRON' || t === 'TRACKS') brandDraws.push({ text: t, x, y, m: { ...m } })
        },
        clearRect: () => { }, fillRect: () => { }, beginPath: () => { }, closePath: () => { },
        moveTo: () => { }, lineTo: () => { }, arcTo: () => { }, fill: () => { }, stroke: () => { },
        drawImage: () => { },
        measureText: (t: string) => ({ width: String(t).length * 10 }),
        createLinearGradient: () => ({ addColorStop: () => { } }),
        font: '', fillStyle: '', strokeStyle: '', lineWidth: 1,
        textAlign: 'left', textBaseline: 'top', letterSpacing: '0px',
        shadowColor: '', shadowBlur: 0,
        get stackDepth() { return stack.length },
    }
    return ctx as unknown as CanvasRenderingContext2D & {
        brandDraws: typeof brandDraws
        stackDepth: number
    }
}

/** Ponto do texto no canvas, já com a matriz vigente aplicada. */
const projected = (d: { x: number; y: number; m: Mat }) => ({
    x: d.m.a * d.x + d.m.c * d.y + d.m.e,
    y: d.m.b * d.x + d.m.d * d.y + d.m.f,
})

const BRAND_OFFSET = { x: 90, y: 150 }
// Bloco encolhido e deslocado — o caso que o dono reportou ("diminuo a parte de
// baixo e o IRONTRACKS diminui junto").
const SHRUNK = { scale: 0.5, offsetX: -140, offsetY: 260 }

const METRICS: Metrics = {
    title: 'Treino A', date: '01/01/2026', volume: 12000, totalTime: 3600, kcal: 480, teamCount: 0,
    exercises: [{ name: 'Supino', reps: '10', weight: '80', rpe: '8', totalReps: '30' }],
}

const NUTRITION_ARGS = {
    canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage: null,
    content: { kind: 'meal' as const, mealName: 'Almoço', calories: 700, protein: 40, carbs: 80, fat: 20, items: [] },
    template: DEFAULT_STORY_TEMPLATE,
}

const CARDIO_ARGS = {
    canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage: null,
    content: {
        title: 'Corrida', activityType: 'run', dateText: '01/01/2026',
        distanceMeters: 5000, durationSeconds: 1800, paceMinKm: 6,
        caloriesEstimated: 400, avgHeartRate: null, elevationGainM: null, routePoints: [],
    },
    template: DEFAULT_STORY_TEMPLATE,
}

/**
 * O invariante: onde a marca aparece e de que tamanho depende SÓ do offset dela.
 * Comparamos o desenho com o transform do bloco aplicado contra o desenho neutro.
 */
const expectBrandUnaffected = (
    label: string,
    render: (ctx: CanvasRenderingContext2D, wt: { scale: number; offsetX: number; offsetY: number }, bo: { x: number; y: number }) => void,
) => {
    const neutral = makeCtx()
    render(neutral, { scale: 1, offsetX: 0, offsetY: 0 }, BRAND_OFFSET)
    const shrunk = makeCtx()
    render(shrunk, SHRUNK, BRAND_OFFSET)

    expect(neutral.brandDraws.length, `${label}: marca não foi desenhada`).toBeGreaterThan(0)
    expect(shrunk.brandDraws.length, `${label}: marca sumiu com o bloco transformado`).toBe(neutral.brandDraws.length)

    neutral.brandDraws.forEach((n, i) => {
        const s = shrunk.brandDraws[i]
        expect(s.m.a, `${label}: "${n.text}" mudou de TAMANHO com o zoom do bloco`).toBeCloseTo(n.m.a, 6)
        expect(s.m.d, `${label}: "${n.text}" mudou de TAMANHO com o zoom do bloco`).toBeCloseTo(n.m.d, 6)
        const pn = projected(n)
        const ps = projected(s)
        expect(ps.x, `${label}: "${n.text}" mudou de POSIÇÃO com o pan do bloco`).toBeCloseTo(pn.x, 6)
        expect(ps.y, `${label}: "${n.text}" mudou de POSIÇÃO com o pan do bloco`).toBeCloseTo(pn.y, 6)
    })

    // Escala 1 = tamanho original da marca, e posição = âncora + offset dela.
    const first = neutral.brandDraws[0]
    expect(first.m.a, `${label}: marca não está em escala 1`).toBeCloseTo(1, 6)
    const p = projected(first)
    expect(p.x, `${label}: posição X da marca`).toBeCloseTo(first.x + BRAND_OFFSET.x, 6)
    expect(p.y, `${label}: posição Y da marca`).toBeCloseTo(first.y + BRAND_OFFSET.y, 6)
}

describe('marca é imune ao zoom/pan do bloco', () => {
    // live/group ficam de fora: lá a marca já é uma peça arrastável própria.
    const fixedBrandLayouts = STORY_LAYOUTS.filter((l) => l.id !== 'live' && l.id !== 'group')

    for (const l of fixedBrandLayouts) {
        it(`layout "${l.label}" (${l.id})`, () => {
            expectBrandUnaffected(l.id, (ctx, workoutTransform, brandOffset) => {
                drawStory({
                    ctx, canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage: null,
                    metrics: METRICS, layout: l.id, livePositions: DEFAULT_LIVE_POSITIONS,
                    template: DEFAULT_STORY_TEMPLATE, workoutTransform, brandOffset,
                })
            })
        })
    }

    it('nutrição', () => {
        expectBrandUnaffected('nutrição', (ctx, workoutTransform, brandOffset) => {
            drawNutritionStory({ ...NUTRITION_ARGS, ctx, workoutTransform, brandOffset })
        })
    })

    it('cardio', () => {
        expectBrandUnaffected('cardio', (ctx, workoutTransform, brandOffset) => {
            drawCardioStory({ ...CARDIO_ARGS, ctx, workoutTransform, brandOffset })
        })
    })

    it('o RESTO do bloco continua obedecendo ao zoom (a marca não congelou tudo)', () => {
        const ctx = makeCtx()
        const seen: Mat[] = []
        const spy = new Proxy(ctx, {
            get(t, p) {
                if (p === 'fillText') {
                    return (text: string, x: number, y: number) => {
                        seen.push({ ...(t as unknown as { matrix: Mat }).matrix })
                            ; (t as unknown as CanvasRenderingContext2D).fillText(text, x, y)
                    }
                }
                return Reflect.get(t, p)
            },
        }) as unknown as CanvasRenderingContext2D
        drawStory({
            ctx: spy, canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage: null,
            metrics: METRICS, layout: 'bottom-row', livePositions: DEFAULT_LIVE_POSITIONS,
            template: DEFAULT_STORY_TEMPLATE, workoutTransform: SHRUNK, brandOffset: BRAND_OFFSET,
        })
        expect(seen.some((m) => Math.abs(m.a - SHRUNK.scale) < 1e-6)).toBe(true)
    })

    it('save/restore fecham (o desfazer da marca não vaza)', () => {
        const ctx = makeCtx()
        drawStory({
            ctx, canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage: null,
            metrics: METRICS, layout: 'bottom-row', livePositions: DEFAULT_LIVE_POSITIONS,
            template: DEFAULT_STORY_TEMPLATE, workoutTransform: SHRUNK, brandOffset: BRAND_OFFSET,
        })
        expect(ctx.stackDepth).toBe(0)
    })
})

describe('brandHandlePct — a alça segue a marca, não o bloco', () => {
    it('sem offset, cai na âncora da marca', () => {
        const p = brandHandlePct({ x: 0, y: 0 })
        expect(p.x).toBeCloseTo(BRAND_BASE_X / CANVAS_W, 6)
        expect(p.y).toBeCloseTo(BRAND_BASE_Y / CANVAS_H, 6)
    })

    it('soma o offset próprio', () => {
        const p = brandHandlePct({ x: 100, y: 200 })
        expect(p.x).toBeCloseTo((BRAND_BASE_X + 100) / CANVAS_W, 6)
        expect(p.y).toBeCloseTo((BRAND_BASE_Y + 200) / CANVAS_H, 6)
    })

    it('sanitiza lixo', () => {
        expect(brandHandlePct(null)).toEqual({ x: BRAND_BASE_X / CANVAS_W, y: BRAND_BASE_Y / CANVAS_H })
        expect(clampBrandOffset({ x: Number.NaN, y: 5 })).toEqual({ x: 0, y: 5 })
    })
})

describe('dragToBrandOffset — a marca segue o dedo', () => {
    it('converte px de tela em px de canvas pelo fator de exibição', () => {
        expect(dragToBrandOffset({ x: 0, y: 0 }, 10, 20, 2)).toEqual({ x: 20, y: 40 })
    })

    it('parte da posição anterior e respeita o clamp', () => {
        expect(dragToBrandOffset({ x: 30, y: 0 }, 10, 0, 1).x).toBe(40)
        expect(dragToBrandOffset({ x: CANVAS_W, y: 0 }, 9999, 0, 1).x).toBe(CANVAS_W)
    })
})

describe('export usa o offset ATUAL da marca (guard de closure)', () => {
    // Mesmo bug já corrigido no zoom: os callbacks de export têm deps enxutas e
    // congelariam o offset inicial — o story sairia com a marca no lugar velho.
    const src = readFileSync(resolve(process.cwd(), 'src/components/stories/useStoryComposer.ts'), 'utf8')

    it('mantém um ref espelhando o brandOffset', () => {
        expect(src).toContain('brandOffsetRef')
        expect(src).toContain('brandOffsetRef.current = brandOffset')
    })

    it('renderComposite lê o offset pelo REF e repassa ao renderer', () => {
        const block = src.slice(src.indexOf('const renderComposite'), src.indexOf('const renderVideoFrameAsJpeg'))
        expect(block).toContain('const bo = brandOffsetRef.current')
        expect(block).toContain('brandOffset: bo')
        expect(block).not.toContain('brandOffset })')
    })
})
