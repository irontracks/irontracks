import { describe, it, expect } from 'vitest'
import { shouldOpenFinishPrompt, getSuggestion, watermarkPlaceholder, buildWorkoutSummary } from '../utils'

// ─── Lógica pura extraída de useActiveWorkoutController ─────────────────────
// Esses testes cobrem as funções mais críticas sem precisar renderizar o hook.

// ---------------------------------------------------------------------------
// Helpers (espelham o código real)
// ---------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function getSetsCount(ex: Record<string, unknown>): number {
    const setsHeader = Math.max(0, Number.parseInt(String(ex?.sets ?? '0'), 10) || 0)
    const sdArr: unknown[] = Array.isArray(ex?.setDetails)
        ? (ex.setDetails as unknown[])
        : Array.isArray(ex?.set_details)
            ? (ex.set_details as unknown[])
            : []
    return Math.max(setsHeader, sdArr.length)
}

/** toggleLinkWeights: adiciona/remove exIdx do Set */
function toggleLinkWeights(prev: Set<number>, exIdx: number): Set<number> {
    const next = new Set(prev)
    if (next.has(exIdx)) next.delete(exIdx)
    else next.add(exIdx)
    return next
}

/** applyLinkedWeightUpdate: retorna as chaves que devem ser atualizadas */
function applyLinkedWeightUpdate(
    ex: Record<string, unknown>,
    exIdx: number,
    patchObj: Record<string, unknown>,
    getLogs: (key: string) => Record<string, unknown>
): Array<{ key: string; value: Record<string, unknown> }> {
    const setsCount = getSetsCount(ex)
    const updates: Array<{ key: string; value: Record<string, unknown> }> = []
    for (let setIdx = 0; setIdx < setsCount; setIdx++) {
        const linkedKey = `${exIdx}-${setIdx}`
        const prev = getLogs(linkedKey)
        updates.push({ key: linkedKey, value: { ...prev, ...patchObj } })
    }
    return updates
}

/** removeExtraSetFromExercise: retorna o próximo estado de exercises + logs */
function computeRemoveSet(
    exercises: Record<string, unknown>[],
    idx: number,
    logs: Record<string, unknown>
): { exercises: Record<string, unknown>[]; logs: Record<string, unknown> } | null {
    const exRaw = exercises[idx] && typeof exercises[idx] === 'object' ? exercises[idx] : {}
    const sdArrRaw = Array.isArray(exRaw?.setDetails)
        ? exRaw.setDetails
        : Array.isArray(exRaw?.set_details)
            ? exRaw.set_details
            : []
    const sdArr = Array.isArray(sdArrRaw) ? [...(sdArrRaw as unknown[])] : []
    const setsCount = getSetsCount(exRaw)

    if (setsCount <= 1) return null // impede deletar última série

    sdArr.pop()
    const nextExercises = [...exercises]
    nextExercises[idx] = { ...exRaw, sets: setsCount - 1, setDetails: sdArr }

    const nextLogs = { ...logs }
    const discardedKey = `${idx}-${setsCount - 1}`
    try { delete nextLogs[discardedKey] } catch { }

    return { exercises: nextExercises, logs: nextLogs }
}

// ─── Testes ────────────────────────────────────────────────────────────────

describe('useActiveWorkoutController — toggleLinkWeights', () => {
    it('adiciona exIdx ao Set quando não estava presente', () => {
        const prev = new Set<number>()
        const next = toggleLinkWeights(prev, 0)
        expect(next.has(0)).toBe(true)
    })

    it('remove exIdx do Set quando já estava presente', () => {
        const prev = new Set<number>([0])
        const next = toggleLinkWeights(prev, 0)
        expect(next.has(0)).toBe(false)
    })

    it('não muta o Set original', () => {
        const prev = new Set<number>()
        toggleLinkWeights(prev, 1)
        expect(prev.has(1)).toBe(false)
    })

    it('múltiplos exercícios podem estar linkados ao mesmo tempo', () => {
        let s = new Set<number>()
        s = toggleLinkWeights(s, 0)
        s = toggleLinkWeights(s, 2)
        expect(s.has(0)).toBe(true)
        expect(s.has(2)).toBe(true)
        expect(s.size).toBe(2)
    })
})

describe('useActiveWorkoutController — applyLinkedWeightUpdate', () => {
    const ex = { sets: 3, setDetails: [{}, {}, {}] }
    const emptyLogs = (_key: string) => ({})

    it('gera atualização para todas as séries', () => {
        const updates = applyLinkedWeightUpdate(ex, 0, { weight: '80' }, emptyLogs)
        expect(updates).toHaveLength(3)
        expect(updates.map(u => u.key)).toEqual(['0-0', '0-1', '0-2'])
    })

    it('aplica o peso em todas as séries', () => {
        const updates = applyLinkedWeightUpdate(ex, 0, { weight: '100' }, emptyLogs)
        for (const u of updates) {
            expect(u.value.weight).toBe('100')
        }
    })

    it('preserva log existente e sobrescreve apenas o peso', () => {
        const logsWithReps = (key: string) => (key === '0-0' ? { reps: '12', weight: '50' } : {})
        const updates = applyLinkedWeightUpdate(ex, 0, { weight: '90' }, logsWithReps)
        expect(updates[0].value.reps).toBe('12')   // reps preservado
        expect(updates[0].value.weight).toBe('90')  // peso atualizado
    })

    it('usa setsHeader quando setDetails tem menos itens que sets', () => {
        const exFewer = { sets: 4, setDetails: [{}] } // 4 sets declarados, 1 no detalhe
        const updates = applyLinkedWeightUpdate(exFewer, 1, { weight: '60' }, emptyLogs)
        expect(updates).toHaveLength(4)
    })
})

describe('useActiveWorkoutController — removeExtraSetFromExercise', () => {
    function makeExercise(setsCount: number) {
        return {
            sets: setsCount,
            setDetails: Array.from({ length: setsCount }, (_, i) => ({ set_number: i + 1 })),
        }
    }

    it('retorna null quando exercício tem apenas 1 série (não permite deletar)', () => {
        const exercises = [makeExercise(1)]
        const result = computeRemoveSet(exercises, 0, {})
        expect(result).toBeNull()
    })

    it('reduz o setsCount em 1 ao remover a última série', () => {
        const exercises = [makeExercise(3)]
        const result = computeRemoveSet(exercises, 0, {})
        expect(result).not.toBeNull()
        expect(result!.exercises[0].sets).toBe(2)
    })

    it('remove o último setDetail', () => {
        const exercises = [makeExercise(3)]
        const result = computeRemoveSet(exercises, 0, {})
        const sd = result!.exercises[0].setDetails as unknown[]
        expect(sd).toHaveLength(2)
    })

    it('remove o log correspondente à série deletada', () => {
        const exercises = [makeExercise(3)]
        const logs = { '0-0': { weight: '80' }, '0-1': { weight: '90' }, '0-2': { weight: '100' } }
        const result = computeRemoveSet(exercises, 0, logs)
        expect(result!.logs['0-2']).toBeUndefined()  // log da série deletada removido
        expect(result!.logs['0-0']).toBeDefined()     // logs anteriores preservados
        expect(result!.logs['0-1']).toBeDefined()
    })

    it('não muta os arrays originais', () => {
        const exercises = [makeExercise(3)]
        const logs = { '0-2': { weight: '100' } }
        computeRemoveSet(exercises, 0, logs)
        expect((exercises[0].setDetails as unknown[]).length).toBe(3) // original intacto
        expect(logs['0-2']).toBeDefined()                              // logs originais intactos
    })

    it('funciona para exercícios com 2 séries → permite deletar até 1', () => {
        const exercises = [makeExercise(2)]
        const result = computeRemoveSet(exercises, 0, {})
        expect(result).not.toBeNull()
        expect(result!.exercises[0].sets).toBe(1)
    })
})

describe('useActiveWorkoutController — getSetsCount', () => {
    it('usa o valor de sets quando setDetails está vazio', () => {
        expect(getSetsCount({ sets: 4, setDetails: [] })).toBe(4)
    })

    it('usa o comprimento de setDetails quando maior que sets', () => {
        expect(getSetsCount({ sets: 2, setDetails: [{}, {}, {}] })).toBe(3)
    })

    it('funciona com set_details (snake_case)', () => {
        expect(getSetsCount({ sets: 0, set_details: [{}, {}] })).toBe(2)
    })

    it('retorna 0 para exercício sem configuração', () => {
        expect(getSetsCount({})).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// shouldOpenFinishPrompt — prompt automático ao concluir todos os exercícios
// ---------------------------------------------------------------------------
describe('shouldOpenFinishPrompt', () => {
    const base = { allComplete: false, prevAllComplete: false, alreadyPrompted: false, finishing: false }

    it('dispara na transição não-completo → completo', () => {
        expect(shouldOpenFinishPrompt({ ...base, allComplete: true, prevAllComplete: false })).toBe(true)
    })

    it('NÃO dispara no mount/resume (já estava completo)', () => {
        expect(shouldOpenFinishPrompt({ ...base, allComplete: true, prevAllComplete: true })).toBe(false)
    })

    it('NÃO dispara se ainda não está tudo completo', () => {
        expect(shouldOpenFinishPrompt({ ...base, allComplete: false, prevAllComplete: false })).toBe(false)
    })

    it('NÃO repete depois de já ter perguntado uma vez', () => {
        expect(shouldOpenFinishPrompt({ ...base, allComplete: true, prevAllComplete: false, alreadyPrompted: true })).toBe(false)
    })

    it('NÃO dispara enquanto já está finalizando', () => {
        expect(shouldOpenFinishPrompt({ ...base, allComplete: true, prevAllComplete: false, finishing: true })).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// Watermark do "último treino" (peso/reps/RPE) — usado inline e nos modais
// ---------------------------------------------------------------------------
describe('getSuggestion / watermarkPlaceholder', () => {
    it('getSuggestion lê a sugestão da série pelo key', () => {
        const map = { '0-0': { weight: 80, reps: 10, rpe: 8 } }
        expect(getSuggestion(map, '0-0')).toEqual({ weight: 80, reps: 10, rpe: 8 })
        expect(getSuggestion(map, '9-9')).toBeNull()
        expect(getSuggestion(null, '0-0')).toBeNull()
        expect(getSuggestion(map, '')).toBeNull()
    })

    it('watermarkPlaceholder usa a sugestão (kg no peso, valor cru em reps/rpe)', () => {
        const s = { weight: 80, reps: 10, rpe: 8 }
        expect(watermarkPlaceholder(s, 'weight', 'Peso')).toBe('80 kg')
        expect(watermarkPlaceholder(s, 'reps', 'Reps')).toBe('10')
        expect(watermarkPlaceholder(s, 'rpe', 'RPE')).toBe('8')
    })

    it('cai no fallback quando não há sugestão para o campo', () => {
        expect(watermarkPlaceholder(null, 'weight', 'Ex: 80')).toBe('Ex: 80')
        expect(watermarkPlaceholder({ weight: null }, 'weight', 'kg')).toBe('kg')
        expect(watermarkPlaceholder({ weight: 80 }, 'rpe', '1–10')).toBe('1–10')
    })
})

// buildWorkoutSummary — resumo do treino no prompt de finalização
describe('buildWorkoutSummary', () => {
    const exs = [{ name: 'Supino reto' }, { name: 'Crucifixo' }]

    it('resume séries feitas + volume por exercício e totais', () => {
        const logs = {
            '0-0': { done: true, weight: '100', reps: '10' },
            '0-1': { done: true, weight: '100', reps: '8' },
            '1-0': { done: true, weight: '20', reps: '12' },
        }
        const r = buildWorkoutSummary(exs, logs)
        expect(r.exercises).toBe(2)
        expect(r.sets).toBe(3)
        expect(r.volume).toBe(100 * 10 + 100 * 8 + 20 * 12) // 2040
        expect(r.text).toContain('Supino reto — 2 séries')
        expect(r.text).toContain('Crucifixo — 1 série')
        expect(r.text).toContain('2 exercícios · 3 séries')
    })

    it('ignora exercício sem nenhuma série feita', () => {
        const logs = { '0-0': { done: true, weight: '50', reps: '10' }, '1-0': { done: false } }
        const r = buildWorkoutSummary(exs, logs)
        expect(r.exercises).toBe(1)
        expect(r.text).not.toContain('Crucifixo')
    })

    it('flag "sem carga" quando série feita sem peso/reps', () => {
        const logs = { '0-0': { done: true, weight: '', reps: '' } }
        const r = buildWorkoutSummary(exs, logs)
        expect(r.text).toContain('⚠️ sem carga')
        expect(r.volume).toBe(0)
    })

    it('parseia peso com vírgula decimal', () => {
        const logs = { '0-0': { done: true, weight: '28,5', reps: '10' } }
        expect(buildWorkoutSummary(exs, logs).volume).toBe(285)
    })

    it('não confunde exercício 1 com 10 (prefixo ancorado no traço)', () => {
        const many = Array.from({ length: 11 }, (_, i) => ({ name: `Ex${i}` }))
        const logs = { '1-0': { done: true, weight: '10', reps: '10' }, '10-0': { done: true, weight: '5', reps: '5' } }
        const r = buildWorkoutSummary(many, logs)
        expect(r.text).toContain('Ex1 — 1 série · 100 kg')
        expect(r.text).toContain('Ex10 — 1 série · 25 kg')
    })

    it('texto vazio quando nada foi feito', () => {
        expect(buildWorkoutSummary(exs, {}).text).toBe('')
        expect(buildWorkoutSummary(null, null).text).toBe('')
    })
})
