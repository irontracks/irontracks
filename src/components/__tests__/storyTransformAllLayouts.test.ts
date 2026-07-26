import { describe, it, expect } from 'vitest'
import { CANVAS_W, CANVAS_H, STORY_LAYOUTS, DEFAULT_LIVE_POSITIONS, drawStory, type Metrics } from '../storyComposerUtils'
import { drawNutritionStory } from '../stories/nutritionStory'
import { drawCardioStory } from '../stories/cardioStory'
import { DEFAULT_STORY_TEMPLATE } from '../stories/storyTemplates'

// Guard: o ajuste do card (arrastar pros lados/cima/baixo + zoom) nasceu SÓ no
// layout "Treino". O dono pediu o mesmo em TODOS os templates/layouts de story.
// Sem este teste, um layout novo (ou um refactor no drawStory) volta a ignorar o
// transform em silêncio — o usuário move o card e nada acontece na exportação.

type Call = { fn: string; args: unknown[] }

const makeCtx = () => {
    const calls: Call[] = []
    const rec = (fn: string) => (...args: unknown[]) => { calls.push({ fn, args }) }
    const ctx = {
        calls,
        save: rec('save'),
        restore: rec('restore'),
        translate: rec('translate'),
        scale: rec('scale'),
        clearRect: rec('clearRect'),
        fillRect: rec('fillRect'),
        fillText: rec('fillText'),
        beginPath: rec('beginPath'),
        closePath: rec('closePath'),
        moveTo: rec('moveTo'),
        lineTo: rec('lineTo'),
        arcTo: rec('arcTo'),
        fill: rec('fill'),
        stroke: rec('stroke'),
        drawImage: rec('drawImage'),
        measureText: (t: string) => ({ width: String(t).length * 10 }),
        createLinearGradient: () => ({ addColorStop: () => { } }),
        font: '', fillStyle: '', strokeStyle: '', lineWidth: 1,
        textAlign: 'left', textBaseline: 'top', letterSpacing: '0px',
        shadowColor: '', shadowBlur: 0,
    }
    return ctx as unknown as CanvasRenderingContext2D & { calls: Call[] }
}

const TRANSFORM = { scale: 1.5, offsetX: 120, offsetY: -80 }

const METRICS: Metrics = {
    title: 'Treino A',
    date: '01/01/2026',
    volume: 12000,
    totalTime: 3600,
    kcal: 480,
    teamCount: 0,
    exercises: [{ name: 'Supino', reps: '10', weight: '80', rpe: '8', totalReps: '30' }],
}

/** O transform tem que aparecer como scale(1.5,1.5) + translate do offset. */
const assertTransformApplied = (ctx: CanvasRenderingContext2D & { calls: Call[] }, label: string) => {
    const scaled = ctx.calls.some((c) => c.fn === 'scale' && c.args[0] === TRANSFORM.scale && c.args[1] === TRANSFORM.scale)
    const moved = ctx.calls.some((c) => c.fn === 'translate' && c.args[0] === TRANSFORM.offsetX && c.args[1] === TRANSFORM.offsetY)
    expect(scaled, `${label}: zoom não foi aplicado`).toBe(true)
    expect(moved, `${label}: reposição (arrasto) não foi aplicada`).toBe(true)
}

/** save/restore precisam fechar — senão o transform vaza pro próximo draw. */
const assertBalanced = (ctx: CanvasRenderingContext2D & { calls: Call[] }, label: string) => {
    let depth = 0
    for (const c of ctx.calls) {
        if (c.fn === 'save') depth++
        if (c.fn === 'restore') depth--
        expect(depth >= 0, `${label}: restore sem save correspondente`).toBe(true)
    }
    expect(depth, `${label}: save/restore desbalanceado`).toBe(0)
}

describe('drawStory — zoom/reposição vale em TODOS os layouts', () => {
    for (const l of STORY_LAYOUTS) {
        it(`aplica o transform no layout "${l.label}" (${l.id})`, () => {
            const ctx = makeCtx()
            drawStory({
                ctx, canvasW: CANVAS_W, canvasH: CANVAS_H,
                backgroundImage: null, metrics: METRICS, layout: l.id,
                livePositions: DEFAULT_LIVE_POSITIONS,
                template: DEFAULT_STORY_TEMPLATE,
                workoutTransform: TRANSFORM,
            })
            assertTransformApplied(ctx, l.id)
            assertBalanced(ctx, l.id)
        })
    }

    it('sem transform (neutro) não mexe no ctx e segue balanceado', () => {
        const ctx = makeCtx()
        drawStory({
            ctx, canvasW: CANVAS_W, canvasH: CANVAS_H,
            backgroundImage: null, metrics: METRICS, layout: 'bottom-row',
            livePositions: DEFAULT_LIVE_POSITIONS,
            template: DEFAULT_STORY_TEMPLATE,
            workoutTransform: { scale: 1, offsetX: 0, offsetY: 0 },
        })
        expect(ctx.calls.some((c) => c.fn === 'scale')).toBe(false)
        assertBalanced(ctx, 'neutro')
    })
})

describe('stories de nutrição e cardio — mesmo ajuste do treino', () => {
    it('nutrição aplica o transform', () => {
        const ctx = makeCtx()
        drawNutritionStory({
            ctx, canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage: null,
            content: {
                kind: 'meal', mealName: 'Almoço', calories: 700,
                protein: 40, carbs: 80, fat: 20, items: [],
            },
            template: DEFAULT_STORY_TEMPLATE,
            workoutTransform: TRANSFORM,
        })
        assertTransformApplied(ctx, 'nutrição')
        assertBalanced(ctx, 'nutrição')
    })

    it('cardio aplica o transform', () => {
        const ctx = makeCtx()
        drawCardioStory({
            ctx, canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage: null,
            content: {
                title: 'Corrida', activityType: 'run', dateText: '01/01/2026',
                distanceMeters: 5000, durationSeconds: 1800, paceMinKm: 6,
                caloriesEstimated: 400, avgHeartRate: null, elevationGainM: null,
                routePoints: [],
            },
            template: DEFAULT_STORY_TEMPLATE,
            workoutTransform: TRANSFORM,
        })
        assertTransformApplied(ctx, 'cardio')
        assertBalanced(ctx, 'cardio')
    })
})
