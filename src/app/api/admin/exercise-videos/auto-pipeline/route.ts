/**
 * POST /api/admin/exercise-videos/auto-pipeline
 *
 * Pipeline orquestrador que processa exercícios sem vídeo em lote:
 *   1. Detecta exercícios sem `video_url` na exercise_library
 *   2. Pra cada um, gera queries via Gemini
 *   3. Busca candidatos no YouTube
 *   4. Enriquece com duração + views
 *   5. Pontua cada candidato (whitelist + título + duração + views)
 *   6. Decisão por score:
 *      - >= 80 → auto-aprova como primary (cria/atualiza row em exercise_videos)
 *      - 50-79 → pending pra revisão humana
 *      - < 50  → descarta
 *
 * Body: { limit?: number } — default 10, max 30 (controla custo Gemini+YouTube)
 *
 * Resposta:
 *   {
 *     ok: true,
 *     processed: N,
 *     auto_approved: N,
 *     pending_review: N,
 *     no_candidates: N,
 *     errors: N,
 *     details: [{ exercise_name, status, top_score, reason }]
 *   }
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoleOrBearer } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  getVideoQueriesFromGemini,
  searchYouTubeCandidates,
  enrichYouTubeVideos,
  scoreVideoCandidate,
  type YouTubeCandidateEnriched,
  type WhitelistedChannel,
} from '@/lib/videoSuggestions'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'
import { logError, logInfo } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // até 60s pra processar lote

const BodySchema = z.object({
  limit: z.coerce.number().optional(),
}).strip()

const AUTO_APPROVE_THRESHOLD = 80
const REVIEW_THRESHOLD = 50

interface PipelineResult {
  exercise_name: string
  status: 'auto_approved' | 'pending_review' | 'no_candidates' | 'error'
  top_score?: number
  reason?: string
  error?: string
}

export async function POST(req: Request) {
  try {
    const auth = await requireRoleOrBearer(req, ['admin'])
    if (!auth.ok) return auth.response

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const limitRaw = Number((parsedBody.data as Record<string, unknown>)?.limit)
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(30, Math.floor(limitRaw))) : 10

    const admin = createAdminClient()

    // ── 1. Carrega whitelist em memória ─────────────────────────────
    const { data: whitelistRows } = await admin
      .from('video_channel_whitelist')
      .select('channel_id, channel_name, trust_level, language')
      .eq('is_active', true)
    const whitelist = new Map<string, WhitelistedChannel>()
    for (const row of whitelistRows || []) {
      const r = row as WhitelistedChannel
      if (r?.channel_id) whitelist.set(r.channel_id, r)
    }

    // ── 2. Detecta exercícios sem vídeo ─────────────────────────────
    // Pega da exercise_library (que é o catálogo canônico). Filtra os
    // que JÁ TÊM vídeo aprovado em exercise_videos pra não reprocessar.
    const { data: libRows, error: libErr } = await admin
      .from('exercise_library')
      .select('id, display_name_pt, normalized_name')
      .or('video_url.is.null,video_url.eq.')
      .limit(limit * 3) // sobre-busca pra absorver os que vamos pular
    if (libErr) {
      return NextResponse.json({ ok: false, error: libErr.message }, { status: 400 })
    }

    // Quais desses JÁ têm vídeo primary aprovado em exercise_videos
    const exerciseIds = (libRows || []).map(r => String((r as { id?: string }).id || '')).filter(Boolean)
    const { data: videosExisting } = await admin
      .from('exercise_videos')
      .select('exercise_library_id')
      .eq('status', 'approved')
      .eq('is_primary', true)
      .in('exercise_library_id', exerciseIds)
    const alreadyHasPrimary = new Set<string>()
    for (const v of videosExisting || []) {
      const id = String((v as { exercise_library_id?: string }).exercise_library_id || '')
      if (id) alreadyHasPrimary.add(id)
    }

    const toProcess = (libRows || [])
      .map(r => ({
        id: String((r as { id?: string }).id || ''),
        name: String((r as { display_name_pt?: string }).display_name_pt || '').trim(),
        normalized: String((r as { normalized_name?: string }).normalized_name || '').trim(),
      }))
      .filter(r => r.id && r.name && !alreadyHasPrimary.has(r.id))
      .slice(0, limit)

    if (toProcess.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        auto_approved: 0,
        pending_review: 0,
        no_candidates: 0,
        errors: 0,
        details: [],
        message: 'Nenhum exercício pendente — todos cobertos.',
      })
    }

    // ── 3. Processa um a um (sequencial pra controlar rate limit) ──
    const details: PipelineResult[] = []
    let autoApprovedCount = 0
    let pendingReviewCount = 0
    let noCandidatesCount = 0
    let errorCount = 0

    for (const ex of toProcess) {
      try {
        // 3a. Queries via Gemini
        let queries: string[] = []
        try {
          queries = await getVideoQueriesFromGemini(ex.name)
        } catch {
          queries = []
        }
        if (queries.length === 0) {
          queries = [`${ex.name} execução`, `${ex.name} técnica`, `${ex.name} how to`]
        }

        // 3b. Coleta candidatos (top 5 por query, max ~10 deduplicados)
        const seen = new Set<string>()
        const allCandidates: Awaited<ReturnType<typeof searchYouTubeCandidates>> = []
        for (const q of queries.slice(0, 2)) {
          const list = await searchYouTubeCandidates(q, 5)
          for (const c of list) {
            if (!seen.has(c.videoId)) {
              seen.add(c.videoId)
              allCandidates.push(c)
            }
          }
        }

        if (allCandidates.length === 0) {
          noCandidatesCount++
          details.push({ exercise_name: ex.name, status: 'no_candidates' })
          continue
        }

        // 3c. Enriquece com duração + views
        const enriched: YouTubeCandidateEnriched[] = await enrichYouTubeVideos(allCandidates)

        // 3d. Pontua cada um, escolhe o melhor
        const scored = enriched
          .map(c => ({ candidate: c, score: scoreVideoCandidate(ex.name, c, whitelist) }))
          .sort((a, b) => b.score.total - a.score.total)
        const best = scored[0]
        const topScore = best.score.total

        // 3e. Decisão por threshold
        if (topScore >= AUTO_APPROVE_THRESHOLD) {
          // Auto-aprovado: cria/atualiza row primary em exercise_videos
          // E atualiza exercise_library.video_url também (pra consumers
          // legados que leem direto dali).
          const nowIso = new Date().toISOString()
          const { error: upsertErr } = await admin
            .from('exercise_videos')
            .upsert({
              exercise_library_id: ex.id,
              normalized_name: ex.normalized,
              provider: 'youtube',
              provider_video_id: best.candidate.videoId,
              url: best.candidate.url,
              title: best.candidate.title,
              channel_title: best.candidate.channelTitle,
              language: 'auto',
              status: 'approved',
              is_primary: true,
              quality_score: topScore,
              auto_approved: true,
              score_breakdown: best.score,
              approved_at: nowIso,
            }, { onConflict: 'exercise_library_id,provider,provider_video_id' })

          if (upsertErr) {
            errorCount++
            details.push({ exercise_name: ex.name, status: 'error', error: upsertErr.message })
            continue
          }

          await admin
            .from('exercise_library')
            .update({ video_url: best.candidate.url })
            .eq('id', ex.id)

          autoApprovedCount++
          details.push({
            exercise_name: ex.name,
            status: 'auto_approved',
            top_score: topScore,
            reason: best.score.reason,
          })
        } else if (topScore >= REVIEW_THRESHOLD) {
          // Pending pra revisão — grava todos os top 3 como pending,
          // sem marcar primary. O admin vê na fila e escolhe na UI.
          const topThree = scored.slice(0, 3)
          for (const s of topThree) {
            await admin.from('exercise_videos').upsert({
              exercise_library_id: ex.id,
              normalized_name: ex.normalized,
              provider: 'youtube',
              provider_video_id: s.candidate.videoId,
              url: s.candidate.url,
              title: s.candidate.title,
              channel_title: s.candidate.channelTitle,
              language: 'auto',
              status: 'pending',
              is_primary: false,
              quality_score: s.score.total,
              auto_approved: false,
              score_breakdown: s.score,
            }, { onConflict: 'exercise_library_id,provider,provider_video_id' })
          }

          pendingReviewCount++
          details.push({
            exercise_name: ex.name,
            status: 'pending_review',
            top_score: topScore,
            reason: best.score.reason,
          })
        } else {
          // Descartado silenciosamente — score muito baixo, qualquer
          // vídeo seria pior que não ter nada.
          noCandidatesCount++
          details.push({
            exercise_name: ex.name,
            status: 'no_candidates',
            top_score: topScore,
            reason: `Score ${topScore} abaixo de ${REVIEW_THRESHOLD} — nenhum vídeo confiável`,
          })
        }
      } catch (e) {
        errorCount++
        logError('exercise-videos:auto-pipeline:item', e, { exercise: ex.name })
        details.push({
          exercise_name: ex.name,
          status: 'error',
          error: getErrorMessage(e),
        })
      }
    }

    logInfo('exercise-videos:auto-pipeline', 'Pipeline complete', {
      processed: toProcess.length,
      auto_approved: autoApprovedCount,
      pending_review: pendingReviewCount,
      no_candidates: noCandidatesCount,
      errors: errorCount,
    })

    return NextResponse.json({
      ok: true,
      processed: toProcess.length,
      auto_approved: autoApprovedCount,
      pending_review: pendingReviewCount,
      no_candidates: noCandidatesCount,
      errors: errorCount,
      details,
    })
  } catch (e) {
    logError('exercise-videos:auto-pipeline', e)
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
