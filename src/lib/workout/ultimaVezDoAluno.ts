/**
 * "Da última vez" — o peso/reps/RPE que o aluno fez na sessão mais recente
 * daquele exercício, série a série.
 *
 * É o watermark que o app do aluno imprime como placeholder do campo de peso, e
 * agora também o que o PROFESSOR vê no painel de controle. Antes o coach anotava
 * às cegas: os campos vinham vazios e nada na tela dizia com quanto o aluno tinha
 * feito na semana passada.
 *
 * ⚠️ A regra parece trivial e não é: o número exibido NÃO é `topWeight` nem
 * `avgWeight` — é `setWeights[setIdx]`, POR SÉRIE, caindo para o top/média só
 * quando a sessão antiga não guardou detalhe por série. Mostrar a média no painel
 * daria ao professor um número diferente do que está na tela do aluno, na mesma
 * sessão, para a mesma série. E o arredondamento é parte da regra (`roundSuggestion`),
 * não acabamento: é ele que faz o placeholder cair no incremento montável.
 *
 * Por isso esta função existe em vez de uma segunda conta do lado do professor:
 * duas implementações "certas" isoladamente que discordam na fronteira são a
 * forma de defeito que nenhuma suíte verde pega — a mesma lição dos 14 renderers.
 */
import { roundSuggestion } from '@/components/workout/helpers/deloadHelpers'
import { toNumber } from '@/components/workout/utils'
import type { ReportHistoryItem } from '@/components/workout/types'

/** `null` para ausente/vazio — ao contrário de `toNumber`, que devolveria 0. */
function numeroOuNulo(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null
    const n = toNumber(v)
    return n === null || !Number.isFinite(n) ? null : n
}

export interface UltimaVezDaSerie {
    weight: number | null
    reps: number | null
    rpe: number | null
}

/** Sessão mais recente do exercício (maior `ts`), ou `null` sem histórico. */
export function sessaoMaisRecente(items: readonly ReportHistoryItem[] | null | undefined): ReportHistoryItem | null {
    const lista = Array.isArray(items) ? items : []
    if (!lista.length) return null
    return lista.slice().sort((a, b) => Number(b?.ts || 0) - Number(a?.ts || 0))[0] ?? null
}

/**
 * Watermark por índice de série: `{ 0: {...}, 1: {...} }`.
 *
 * Série sem peso utilizável fica FORA do mapa — não entra com `weight: null`.
 * Quem consome distingue "não sei" de "foi zero", e a tela não deve escrever um
 * traço onde nunca houve medição.
 */
export function ultimaVezPorSerie(
    items: readonly ReportHistoryItem[] | null | undefined,
    setsCount: number,
): Record<number, UltimaVezDaSerie> {
    const latest = sessaoMaisRecente(items)
    if (!latest) return {}

    const perSetWeights: unknown[] = Array.isArray(latest.setWeights) ? latest.setWeights : []
    const perSetReps: unknown[] = Array.isArray(latest.setReps) ? latest.setReps : []
    const perSetRpes: unknown[] = Array.isArray(latest.setRpes) ? latest.setRpes : []

    const fallbackWeight = toNumber(latest.topWeight ?? latest.avgWeight ?? null)
    const fallbackReps = toNumber(latest.avgReps ?? null)
    if (!fallbackWeight && !perSetWeights.length) return {}

    const total = Math.max(0, Math.floor(Number(setsCount) || 0))
    const mapa: Record<number, UltimaVezDaSerie> = {}

    for (let setIdx = 0; setIdx < total; setIdx++) {
        // ⚠️ `toNumber(null)` devolve **0**, não `null` (`Number('')` é 0 e o
        // helper só rejeita não-finito). Aplicá-lo antes do `??` mataria o
        // fallback: série sem detalhe viraria 0 em vez de cair no `topWeight`,
        // e o professor veria "Kg" vazio onde o aluno vê o peso da última vez.
        // Por isso o `??` opera sobre o valor CRU, como no app do aluno.
        const peso = numeroOuNulo(perSetWeights[setIdx]) ?? fallbackWeight
        const reps = numeroOuNulo(perSetReps[setIdx]) ?? fallbackReps
        const rpe = numeroOuNulo(perSetRpes[setIdx])
        if (!peso || !Number.isFinite(peso) || peso <= 0) continue
        const arredondado = roundSuggestion({ weight: peso, reps: reps ?? null, rpe: rpe ?? null })
        mapa[setIdx] = {
            weight: arredondado.weight ?? null,
            reps: arredondado.reps ?? null,
            rpe: arredondado.rpe ?? null,
        }
    }

    return mapa
}
