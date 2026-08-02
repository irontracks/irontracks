/**
 * API: POST /api/workout/muscle-gap
 *
 * Monta o card do botão "Ajustar treino" de um grupo muscular apontado pela
 * correlação. Recebe { assessmentId, muscleLabel } e devolve o DIAGNÓSTICO
 * (falta padrão / falta volume / é execução) mais as sugestões que couberem.
 *
 * Duas decisões de produto que o código precisa honrar:
 *
 * 1. NÃO é chamada de IA. O diagnóstico sai de regra pura sobre o treino real
 *    (`diagnoseMuscleGap`) e as sugestões saem do catálogo `exercise_library`.
 *    Modelo generativo aqui produziria exercício que não existe no app e
 *    justificativa com cara de estudo — que é o que se quer evitar (decisão do
 *    dono, ago/2026).
 *
 * 2. Um grupo com MUITA série e desenvolvimento fraco NÃO recebe sugestão de
 *    exercício: recebe correção de execução. Sugerir volume ali repetiria o
 *    viés que já produziu conselho errado nesta feature.
 *
 * Acesso: dono da avaliação ou personal com vínculo vivo. Rate limit: 20/min.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { canCoachStudent } from '@/utils/auth/studentAccess'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'
import { respondDbError } from '@/utils/api/dbError'
import { logError } from '@/lib/logger'
import { aggregateTrainingWindow } from '@/utils/bodyPhoto/trainingWindow'
import { diagnoseMuscleGap, type DevelopmentLevel } from '@/utils/workout/muscleGapDiagnosis'
import { TECHNIQUE_CUES, isExerciseRestricted } from '@/utils/workout/movementPatterns'
import { ID_TO_LIBRARY_MUSCLES, muscleIdFromLabel } from '@/utils/workout/muscleIdMapping'
import type { BodyPhotoLaudo } from '@/types/bodyPhotoAssessment'

export const dynamic = 'force-dynamic'

const DEFAULT_LOOKBACK_DAYS = 90
const MAX_SUGGESTIONS = 3

const BodySchema = z.object({
    assessmentId: z.string().uuid(),
    muscleLabel: z.string().min(1).max(60),
}).strip()

const dayStr = (d: Date) => d.toISOString().slice(0, 10)

interface LibraryRow {
    display_name_pt: string | null
    normalized_name: string | null
    primary_muscle: string | null
    equipment: string[] | null
    video_url: string | null
    is_compound: boolean | null
}

export async function POST(req: Request) {
    try {
        const auth = await requireUser()
        if (!auth.ok) return auth.response
        const userId = String(auth.user.id || '').trim()

        const ip = getRequestIp(req)
        const rl = await checkRateLimitAsync(`workout:muscle-gap:${userId}:${ip}`, 20, 60_000)
        if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

        const parsed = await parseJsonBody(req, BodySchema)
        if (parsed.response) return parsed.response
        const { assessmentId, muscleLabel } = parsed.data!

        const muscle = muscleIdFromLabel(muscleLabel)
        if (!muscle) return NextResponse.json({ ok: false, error: 'unknown_muscle' }, { status: 400 })

        const admin = createAdminClient()

        const { data: assessment, error: aErr } = await admin
            .from('body_photo_assessments')
            .select('id, user_id, assessment_date, analysis')
            .eq('id', assessmentId)
            .maybeSingle()
        if (aErr) return respondDbError('workout:muscle-gap:assessment', aErr)
        if (!assessment) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

        const row = assessment as { user_id: string; assessment_date: string; analysis: BodyPhotoLaudo | null }
        if (userId !== row.user_id && !(await canCoachStudent({ id: userId, email: auth.user.email }, row.user_id))) {
            return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
        }

        // ── Janela de treino: mesma do cruzamento (90 dias até a foto) ────────
        const photoDate = new Date(`${String(row.assessment_date)}T00:00:00Z`)
        const fromDate = new Date(photoDate.getTime() - DEFAULT_LOOKBACK_DAYS * 86400_000)
        const toEnd = new Date(photoDate.getTime() + 86400_000 - 1)

        const merged = new Map<string, { notes?: unknown }>()
        const collect = (rows: unknown) => {
            if (!Array.isArray(rows)) return
            for (const r of rows) {
                const w = r as { id?: string; notes?: unknown }
                if (w?.id) merged.set(String(w.id), { notes: w.notes })
            }
        }
        const { data: byCompleted } = await admin
            .from('workouts').select('id, notes, completed_at')
            .eq('user_id', row.user_id).eq('is_template', false)
            .gte('completed_at', fromDate.toISOString()).lte('completed_at', toEnd.toISOString())
        collect(byCompleted)
        const { data: byDate } = await admin
            .from('workouts').select('id, notes, date')
            .eq('user_id', row.user_id).eq('is_template', false)
            .gte('date', dayStr(fromDate)).lte('date', dayStr(photoDate))
        collect(byDate)

        // topN alto: aqui não é resumo pra IA, é a lista completa pro diagnóstico.
        const stats = aggregateTrainingWindow([...merged.values()], 500)

        // ── Quais exercícios treinados pertencem a este grupo ─────────────────
        const libMuscles = ID_TO_LIBRARY_MUSCLES[muscle] ?? []
        const { data: libraryRows } = await admin
            .from('exercise_library')
            .select('display_name_pt, normalized_name, primary_muscle, equipment, video_url, is_compound')
            .in('primary_muscle', libMuscles.length ? libMuscles : ['__none__'])
        const library = (libraryRows || []) as LibraryRow[]

        const norm = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
        const libraryNames = new Set(library.map((l) => norm(l.display_name_pt)).filter(Boolean))

        const trained = stats.topExercises.filter((ex) => {
            const n = norm(ex.name)
            if (!n) return false
            if (libraryNames.has(n)) return true
            // Casa por prefixo forte: "Panturrilha sentado sólio" ~ "Panturrilha sentado".
            return [...libraryNames].some((lib) => lib.length > 6 && (n.startsWith(lib) || lib.startsWith(n)))
        })

        // ── Diagnóstico ──────────────────────────────────────────────────────
        const laudo = row.analysis
        const development = (laudo?.muscleGroups || [])
            .find((g) => muscleIdFromLabel(g.group) === muscle)?.development as DevelopmentLevel | undefined

        const weeks = Math.max(1, Math.round((toEnd.getTime() - fromDate.getTime()) / (7 * 86400_000)))
        const diagnosis = diagnoseMuscleGap({
            muscle,
            weeks,
            exercises: trained.map((e) => ({ name: e.name, sets: e.sets })),
            development: development ?? null,
        })

        // ── Restrições declaradas pelo aluno ─────────────────────────────────
        // O catálogo não sabe de dor. Este card já sugeriu Stiff a quem escreveu
        // "SEM hip thrust/coice (lombar)" — sugestão tecnicamente correta pro
        // padrão faltante e errada pra pessoa. O que o texto NOMEIA sai da lista;
        // o resto vai visível pro card, porque inferir que outro exercício carrega
        // a mesma estrutura é julgamento clínico, não regex.
        const { data: profileRow } = await admin
            .from('vip_profile').select('constraints').eq('user_id', row.user_id).maybeSingle()
        const rawConstraints = (profileRow as { constraints?: unknown } | null)?.constraints ?? null
        const constraintsText = typeof rawConstraints === 'string'
            ? rawConstraints.trim()
            : rawConstraints ? JSON.stringify(rawConstraints) : ''

        // ── Sugestões: só quando falta PADRÃO. Volume e execução não pedem
        //    exercício novo — mandar um aqui seria o conselho errado. ──────────
        const trainedNames = new Set(trained.map((e) => norm(e.name)))
        const excludedByRestriction: string[] = []
        const suggestions = diagnosis.kind !== 'missing_pattern' ? [] : diagnosis.missingPatterns.flatMap((pattern) =>
            library
                .filter((l) => l.display_name_pt && pattern.match.test(l.display_name_pt))
                .filter((l) => !trainedNames.has(norm(l.display_name_pt)))
                .filter((l) => {
                    if (!isExerciseRestricted(String(l.display_name_pt), constraintsText)) return true
                    excludedByRestriction.push(String(l.display_name_pt))
                    return false
                })
                .sort((a, b) => Number(!!b.video_url) - Number(!!a.video_url) || Number(!!b.is_compound) - Number(!!a.is_compound))
                .slice(0, MAX_SUGGESTIONS)
                .map((l) => ({
                    name: l.display_name_pt as string,
                    equipment: Array.isArray(l.equipment) ? l.equipment : [],
                    videoUrl: l.video_url,
                    patternId: pattern.id,
                    patternLabel: pattern.label,
                    why: pattern.why,
                })),
        )

        return NextResponse.json({
            ok: true,
            // Cues só no caso de execução — em qualquer outro tipo eles seriam ruído.
            techniqueCues: diagnosis.kind === 'technique' ? (TECHNIQUE_CUES[muscle] ?? []) : [],
            restriction: constraintsText && suggestions.length + excludedByRestriction.length > 0
                ? { text: constraintsText.slice(0, 300), excluded: [...new Set(excludedByRestriction)].slice(0, 5) }
                : null,
            diagnosis: {
                kind: diagnosis.kind,
                muscle: diagnosis.muscle,
                muscleLabel: diagnosis.muscleLabel,
                setsPerWeek: diagnosis.setsPerWeek,
                targetMin: diagnosis.targetMin,
                targetMax: diagnosis.targetMax,
                suggestedWeeklySets: diagnosis.suggestedWeeklySets,
                missingPatterns: diagnosis.missingPatterns.map((p) => ({ id: p.id, label: p.label, why: p.why })),
                coverages: diagnosis.coverages.map((c) => ({
                    patternId: c.pattern.id,
                    patternLabel: c.pattern.label,
                    sets: c.sets,
                    exercises: c.exercises,
                })),
            },
            suggestions,
            windowWeeks: weeks,
        })
    } catch (e) {
        logError('workout:muscle-gap', e)
        return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
    }
}
