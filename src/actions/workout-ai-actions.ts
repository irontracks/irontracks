import type { ActionResult } from '@/types/actions'

// ─── AI / Progression actions ─────────────────────────────────────────────────

export async function generatePostWorkoutInsights(
    input: unknown,
): Promise<ActionResult<Record<string, unknown>>> {
    try {
        const body = input && typeof input === 'object' ? input : {}
        const res = await fetch('/api/ai/post-workout-insights', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        })
        const json = await res.json().catch((): null => null)
        if (!res.ok || !json?.ok) return { ok: false, error: json?.error || 'Falha ao gerar insights', upgradeRequired: json?.upgradeRequired } as ActionResult<Record<string, unknown>>
        return json as ActionResult<Record<string, unknown>>
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false, error: message }
    }
}

export async function generateExerciseMuscleMap(
    input: unknown,
): Promise<ActionResult<Record<string, unknown>>> {
    try {
        const body = input && typeof input === 'object' ? input : {}
        const res = await fetch('/api/ai/exercise-muscle-map', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        })
        const json = await res.json().catch((): null => null)
        if (!res.ok || !json?.ok) return { ok: false, error: json?.error || 'Falha ao mapear exercícios' }
        return json as ActionResult<Record<string, unknown>>
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false, error: message }
    }
}

export async function getMuscleMapWeek(
    input: unknown,
): Promise<ActionResult<Record<string, unknown>>> {
    try {
        const body = input && typeof input === 'object' ? input : {}
        const res = await fetch('/api/ai/muscle-map-week', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        })
        const json = await res.json().catch((): null => null)
        if (!res.ok || !json?.ok) return { ok: false, error: json?.error || 'Falha ao gerar mapa muscular' }
        return json as ActionResult<Record<string, unknown>>
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false, error: message }
    }
}

export async function getMuscleMapDay(
    input: unknown,
): Promise<ActionResult<Record<string, unknown>>> {
    try {
        const body = input && typeof input === 'object' ? input : {}
        const res = await fetch('/api/ai/muscle-map-day', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        })
        const json = await res.json().catch((): null => null)
        if (!res.ok || !json?.ok) return { ok: false, error: json?.error || 'Falha ao gerar mapa muscular do dia' }
        return json as ActionResult<Record<string, unknown>>
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false, error: message }
    }
}

export async function backfillExerciseMuscleMaps(
    input: unknown,
): Promise<ActionResult<Record<string, unknown>>> {
    try {
        const body = input && typeof input === 'object' ? input : {}
        const res = await fetch('/api/ai/exercise-muscle-map-backfill', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        })
        const json = await res.json().catch((): null => null)
        if (!res.ok || !json?.ok) return { ok: false, error: json?.error || 'Falha ao reprocessar histórico' }
        return json as ActionResult<Record<string, unknown>>
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false, error: message }
    }
}

export async function applyProgressionToNextTemplate(
    input: unknown,
): Promise<ActionResult<Record<string, unknown>>> {
    try {
        const body = input && typeof input === 'object' ? input : {}
        const res = await fetch('/api/ai/apply-progression-next', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        })
        const json = await res.json().catch((): null => null)
        if (!res.ok || !json?.ok) return { ok: false, error: json?.error || 'Falha ao aplicar progressão' }
        return json as ActionResult<Record<string, unknown>>
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false, error: message }
    }
}

export async function generatePeriodReportInsights(input: unknown) {
    try {
        const body = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
        const type = String(body?.type ?? '').trim()
        const stats: Record<string, unknown> | null = body?.stats && typeof body.stats === 'object' ? (body.stats as Record<string, unknown>) : null
        if (!type || !stats) return { ok: false, error: 'missing input' }

        const count = Number(stats.count) || 0
        const totalMinutes = Number(stats.totalMinutes) || 0
        const avgMinutes = Number(stats.avgMinutes) || 0
        const totalVolumeKg = Number(stats.totalVolumeKg) || 0
        const avgVolumeKg = Number(stats.avgVolumeKg) || 0
        const days = Number(stats.days) || 0
        const uniqueDaysCount = Number(stats?.uniqueDaysCount) || 0

        const label = type === 'week' ? 'semanal' : type === 'month' ? 'mensal' : `de ${days} dias`
        const cadenceLabel = type === 'week' ? 'na semana' : type === 'month' ? 'no mês' : 'no período'

        const topByVolume = (Array.isArray(stats?.topExercisesByVolume) ? stats.topExercisesByVolume : []).slice(0, 3)
        const topByFreq = (Array.isArray(stats?.topExercisesByFrequency) ? stats.topExercisesByFrequency : []).slice(0, 3)
        const topVolumeName = String((topByVolume?.[0] as Record<string, unknown>)?.name ?? '').trim()
        const topFreqName = String((topByFreq?.[0] as Record<string, unknown>)?.name ?? '').trim()

        try {
            const aiRes = await fetch('/api/ai/period-insights', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ type, stats }),
            })
            if (aiRes.ok) {
                const aiJson = await aiRes.json().catch((): null => null)
                if (aiJson?.ok && aiJson?.ai && typeof aiJson.ai === 'object') {
                    return { ok: true, ai: aiJson.ai }
                }
            }
        } catch { /* silenced — fall through to deterministic */ }

        const ai = {
            title: `Resumo ${label}`,
            summary: [
                `${count} treino(s) finalizado(s)`,
                `${totalMinutes} min no total (${avgMinutes} min/treino)`,
                `${totalVolumeKg.toLocaleString('pt-BR')}kg de volume (${avgVolumeKg.toLocaleString('pt-BR')}kg/treino)`,
            ],
            highlights: topByVolume.map((x: Record<string, unknown>) => `${String(x?.name ?? '') || 'Exercício'}: ${Number(x?.volumeKg ?? 0).toLocaleString('pt-BR')}kg`),
            focus: [
                uniqueDaysCount ? `Consistência: ${uniqueDaysCount} dia(s) treinados ${cadenceLabel}.` : '',
                topFreqName ? `Exercício mais frequente: ${topFreqName}.` : '',
            ].filter(Boolean),
            nextSteps: [
                count <= 1 ? `Meta rápida: faça 2–3 treinos ${cadenceLabel} para retomar consistência.` : '',
                topVolumeName ? `Progressão: tente +1 rep ou +2,5kg no ${topVolumeName} na próxima sessão.` : '',
                avgMinutes && avgMinutes < 35 ? 'Duração curta: priorize básicos e reduza trocas de exercício.' : '',
            ].filter(Boolean),
            warnings: [] as string[],
        }

        if (count === 0) ai.warnings.push('Sem treinos registrados no período. Ajuste a meta para algo realista e comece pequeno.')
        if (avgMinutes >= 95) ai.warnings.push('Sessões longas: considere reduzir volume por treino para manter qualidade e recuperação.')
        if (uniqueDaysCount && count / Math.max(1, uniqueDaysCount) > 2.5) ai.warnings.push('Muitos treinos no mesmo dia: cuide do sono e do descanso entre sessões.')

        return { ok: true, ai }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false, error: message }
    }
}

export async function generateAssessmentPlanAi(input: unknown) {
    const payload = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
    const assessment: Record<string, unknown> | null = payload?.assessment && typeof payload.assessment === 'object' ? (payload.assessment as Record<string, unknown>) : null
    if (!assessment) return { ok: false, error: 'missing assessment' }

    const studentName = String(payload?.studentName ?? 'Aluno').trim() || 'Aluno'
    const goal = String(payload?.goal ?? '').trim()
    const weight = assessment?.weight != null ? String(assessment.weight).trim() : ''
    const bf = assessment?.body_fat_percentage != null ? String(assessment.body_fat_percentage).trim() : assessment?.bf != null ? String(assessment.bf).trim() : ''

    const summary: string[] = []
    summary.push(`Plano tático (base) para ${studentName}.`)
    if (goal) summary.push(`Objetivo: ${goal}`)
    if (weight) summary.push(`Peso atual: ${weight} kg`)
    if (bf) summary.push(`BF: ${bf}%`)

    return {
        ok: true,
        plan: {
            summary,
            training: [
                'Priorize progressão em básicos (agachamento/terra/supino/remo).',
                'Registre cargas e reps; busque +1 rep ou +2,5kg quando possível.',
                'Frequência sugerida: 4–5x/semana (ajuste conforme rotina).',
            ],
            nutrition: ['Proteína alta e consistente; carbo em torno do treino; hidratação.'],
            habits: ['Sono: 7–9h.', 'Passos: 7k–10k/dia (ajuste conforme objetivo).'],
            warnings: [] as string[],
        },
        usedAi: false,
        reason: 'fallback',
    }
}
