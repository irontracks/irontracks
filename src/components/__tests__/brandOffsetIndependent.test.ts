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

// A marca (IRON·TRACKS) foi "desmembrada" do bloco: o arrasto/zoom geral move o
// conjunto, mas ela tem um offset PRÓPRIO por cima. Sem estes guards, um refactor
// no renderer volta a colar a marca no bloco — e o usuário arrasta a alça sem
// nada acontecer no story exportado.

type Call = { fn: string; args: unknown[] }

const makeCtx = () => {
    const calls: Call[] = []
    const rec = (fn: string) => (...args: unknown[]) => { calls.push({ fn, args }) }
    const ctx = {
        calls,
        save: rec('save'), restore: rec('restore'), translate: rec('translate'), scale: rec('scale'),
        clearRect: rec('clearRect'), fillRect: rec('fillRect'), fillText: rec('fillText'),
        beginPath: rec('beginPath'), closePath: rec('closePath'), moveTo: rec('moveTo'),
        lineTo: rec('lineTo'), arcTo: rec('arcTo'), fill: rec('fill'), stroke: rec('stroke'),
        drawImage: rec('drawImage'),
        measureText: (t: string) => ({ width: String(t).length * 10 }),
        createLinearGradient: () => ({ addColorStop: () => { } }),
        font: '', fillStyle: '', strokeStyle: '', lineWidth: 1,
        textAlign: 'left', textBaseline: 'top', letterSpacing: '0px',
        shadowColor: '', shadowBlur: 0,
    }
    return ctx as unknown as CanvasRenderingContext2D & { calls: Call[] }
}

const BRAND_OFFSET = { x: 90, y: 150 }

const METRICS: Metrics = {
    title: 'Treino A', date: '01/01/2026', volume: 12000, totalTime: 3600, kcal: 480, teamCount: 0,
    exercises: [{ name: 'Supino', reps: '10', weight: '80', rpe: '8', totalReps: '30' }],
}

/** O deslocamento da marca precisa virar um translate próprio no canvas. */
const assertBrandMoved = (ctx: CanvasRenderingContext2D & { calls: Call[] }, label: string) => {
    const moved = ctx.calls.some((c) => c.fn === 'translate' && c.args[0] === BRAND_OFFSET.x && c.args[1] === BRAND_OFFSET.y)
    expect(moved, `${label}: a marca não se moveu sozinha`).toBe(true)
}

/** …e SÓ a marca: o translate dela vem depois de um save e antes do "IRON". */
const assertBrandOnlyScope = (ctx: CanvasRenderingContext2D & { calls: Call[] }, label: string) => {
    const iIron = ctx.calls.findIndex((c) => c.fn === 'fillText' && c.args[0] === 'IRON')
    const iMove = ctx.calls.findIndex((c) => c.fn === 'translate' && c.args[0] === BRAND_OFFSET.x && c.args[1] === BRAND_OFFSET.y)
    expect(iIron, `${label}: marca não foi desenhada`).toBeGreaterThan(-1)
    expect(iMove, `${label}: offset da marca não aplicado`).toBeGreaterThan(-1)
    expect(iMove, `${label}: offset aplicado DEPOIS da marca`).toBeLessThan(iIron)
    const before = ctx.calls.slice(0, iMove)
    expect(before.filter((c) => c.fn === 'save').length, `${label}: offset da marca fora de um save (vaza pro resto)`)
        .toBeGreaterThan(before.filter((c) => c.fn === 'restore').length)
}

describe('brandHandlePct — a alça acompanha o desenho', () => {
    it('sem zoom/pan, cai na âncora da marca', () => {
        const p = brandHandlePct({ x: 0, y: 0 }, { scale: 1, offsetX: 0, offsetY: 0 })
        expect(p.x).toBeCloseTo(BRAND_BASE_X / CANVAS_W, 6)
        expect(p.y).toBeCloseTo(BRAND_BASE_Y / CANVAS_H, 6)
    })

    it('soma o offset próprio da marca', () => {
        const p = brandHandlePct({ x: 100, y: 200 }, { scale: 1, offsetX: 0, offsetY: 0 })
        expect(p.x).toBeCloseTo((BRAND_BASE_X + 100) / CANVAS_W, 6)
        expect(p.y).toBeCloseTo((BRAND_BASE_Y + 200) / CANVAS_H, 6)
    })

    it('acompanha o zoom geral (pivô no centro) — senão a alça descola do desenho', () => {
        const p = brandHandlePct({ x: 0, y: 0 }, { scale: 2, offsetX: 0, offsetY: 0 })
        const expected = ((BRAND_BASE_X - CANVAS_W / 2) * 2 + CANVAS_W / 2) / CANVAS_W
        expect(p.x).toBeCloseTo(expected, 6)
    })

    it('acompanha o pan geral', () => {
        const p = brandHandlePct({ x: 0, y: 0 }, { scale: 1, offsetX: 72, offsetY: -128 })
        expect(p.x).toBeCloseTo((BRAND_BASE_X + 72) / CANVAS_W, 6)
        expect(p.y).toBeCloseTo((BRAND_BASE_Y - 128) / CANVAS_H, 6)
    })
})

describe('dragToBrandOffset — a marca segue o dedo', () => {
    it('converte px de tela em px de canvas pelo fator', () => {
        const r = dragToBrandOffset({ x: 0, y: 0 }, 10, 20, 2, 1)
        expect(r).toEqual({ x: 20, y: 40 })
    })

    it('divide pela escala: com zoom 2x, 10px de dedo NÃO viram 20px de canvas', () => {
        const r = dragToBrandOffset({ x: 0, y: 0 }, 10, 0, 2, 2)
        expect(r.x).toBeCloseTo(10, 6)
    })

    it('parte da posição anterior e respeita o clamp', () => {
        expect(dragToBrandOffset({ x: 30, y: 0 }, 10, 0, 1, 1).x).toBe(40)
        expect(dragToBrandOffset({ x: CANVAS_W, y: 0 }, 9999, 0, 1, 1).x).toBe(CANVAS_W)
    })

    it('clampBrandOffset sanitiza lixo', () => {
        expect(clampBrandOffset(null)).toEqual({ x: 0, y: 0 })
        expect(clampBrandOffset({ x: Number.NaN, y: 5 })).toEqual({ x: 0, y: 5 })
    })
})

describe('renderers — a marca se move sozinha, sem arrastar o resto', () => {
    // live/group ficam de fora: lá a marca já é uma peça arrastável própria.
    const fixedBrandLayouts = STORY_LAYOUTS.filter((l) => l.id !== 'live' && l.id !== 'group')

    for (const l of fixedBrandLayouts) {
        it(`layout "${l.label}" (${l.id})`, () => {
            const ctx = makeCtx()
            drawStory({
                ctx, canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage: null,
                metrics: METRICS, layout: l.id, livePositions: DEFAULT_LIVE_POSITIONS,
                template: DEFAULT_STORY_TEMPLATE, brandOffset: BRAND_OFFSET,
            })
            assertBrandMoved(ctx, l.id)
            assertBrandOnlyScope(ctx, l.id)
        })
    }

    it('nutrição', () => {
        const ctx = makeCtx()
        drawNutritionStory({
            ctx, canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage: null,
            content: { kind: 'meal', mealName: 'Almoço', calories: 700, protein: 40, carbs: 80, fat: 20, items: [] },
            template: DEFAULT_STORY_TEMPLATE, brandOffset: BRAND_OFFSET,
        })
        assertBrandMoved(ctx, 'nutrição')
        assertBrandOnlyScope(ctx, 'nutrição')
    })

    it('cardio', () => {
        const ctx = makeCtx()
        drawCardioStory({
            ctx, canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage: null,
            content: {
                title: 'Corrida', activityType: 'run', dateText: '01/01/2026',
                distanceMeters: 5000, durationSeconds: 1800, paceMinKm: 6,
                caloriesEstimated: 400, avgHeartRate: null, elevationGainM: null, routePoints: [],
            },
            template: DEFAULT_STORY_TEMPLATE, brandOffset: BRAND_OFFSET,
        })
        assertBrandMoved(ctx, 'cardio')
        assertBrandOnlyScope(ctx, 'cardio')
    })

    it('sem offset, nenhum translate da marca aparece', () => {
        const ctx = makeCtx()
        drawStory({
            ctx, canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage: null,
            metrics: METRICS, layout: 'bottom-row', livePositions: DEFAULT_LIVE_POSITIONS,
            template: DEFAULT_STORY_TEMPLATE,
        })
        const iIron = ctx.calls.findIndex((c) => c.fn === 'fillText' && c.args[0] === 'IRON')
        const movedBefore = ctx.calls.slice(0, iIron).some((c) => c.fn === 'translate' && (c.args[0] !== 0 || c.args[1] !== 0))
        expect(movedBefore).toBe(false)
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
