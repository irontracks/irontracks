'use client'

/**
 * VideosTab — Pipeline IA de vídeos demonstrativos.
 *
 * O fluxo antigo era manual exercício-a-exercício, com placeholders
 * "em implementação". Substituído por:
 *
 *   1. KPI cards: cobertura atual + fila de revisão + auto-aprovados
 *   2. Botão "Rodar pipeline" — chama /api/admin/exercise-videos/auto-pipeline
 *      que processa N exercícios sem vídeo (default 10, max 30):
 *        - Gemini gera queries
 *        - YouTube retorna candidatos
 *        - IA pontua (whitelist + título + duração + views)
 *        - Score >= 80 → auto-aprova
 *        - 50-79 → vai pra fila de revisão
 *        - < 50 → descarta
 *   3. Fila de revisão — para cada exercício pendente, mostra top 3
 *      candidatos com Aprovar/Rejeitar inline
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  Video, Play, RefreshCw, Loader2, Sparkles, CheckCircle2, XCircle,
  ExternalLink, AlertCircle,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { logError } from '@/lib/logger'

interface PipelineResult {
  processed: number
  auto_approved: number
  pending_review: number
  no_candidates: number
  errors: number
  details: Array<{
    exercise_name: string
    status: 'auto_approved' | 'pending_review' | 'no_candidates' | 'error'
    top_score?: number
    reason?: string
  }>
}

interface QueueCandidate {
  id: string
  url: string
  title: string
  channel_title: string
  provider_video_id: string
  quality_score: number | null
  score_breakdown: { reason?: string } | null
}

interface QueueExercise {
  exercise_library_id: string
  exercise_name: string
  candidates: QueueCandidate[]
}

export const VideosTab: React.FC = () => {
  // Stats
  const [totalExercises, setTotalExercises] = useState<number | null>(null)
  const [exercisesWithVideo, setExercisesWithVideo] = useState<number | null>(null)
  const [pendingReviewCount, setPendingReviewCount] = useState<number | null>(null)
  const [autoApprovedCount, setAutoApprovedCount] = useState<number | null>(null)
  const [loadingStats, setLoadingStats] = useState(true)

  // Pipeline run
  const [running, setRunning] = useState(false)
  const [lastResult, setLastResult] = useState<PipelineResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [limit, setLimit] = useState(10)

  // Review queue
  const [queue, setQueue] = useState<QueueExercise[]>([])
  const [loadingQueue, setLoadingQueue] = useState(false)
  const [actingOn, setActingOn] = useState<string | null>(null)

  // ── Carregar stats da cobertura via Supabase direto ────────────────
  const loadStats = useCallback(async () => {
    setLoadingStats(true)
    try {
      const supabase = createClient()
      const [
        { count: total },
        { count: withVideo },
        { count: pendingReview },
        { count: autoApproved },
      ] = await Promise.all([
        supabase.from('exercise_library').select('id', { count: 'exact', head: true }),
        supabase.from('exercise_library').select('id', { count: 'exact', head: true })
          .not('video_url', 'is', null).not('video_url', 'eq', ''),
        supabase.from('exercise_videos').select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase.from('exercise_videos').select('id', { count: 'exact', head: true })
          .eq('auto_approved', true),
      ])
      setTotalExercises(total ?? 0)
      setExercisesWithVideo(withVideo ?? 0)
      setPendingReviewCount(pendingReview ?? 0)
      setAutoApprovedCount(autoApproved ?? 0)
    } catch (e) {
      logError('VideosTab:loadStats', e)
    } finally {
      setLoadingStats(false)
    }
  }, [])

  const loadQueue = useCallback(async () => {
    setLoadingQueue(true)
    try {
      const res = await fetch('/api/admin/exercise-videos/review-queue', { cache: 'no-store' })
      const json = await res.json().catch(() => null) as
        | { ok: true; groups: QueueExercise[] }
        | { ok: false; error: string }
        | null
      if (json && 'ok' in json && json.ok) {
        setQueue(json.groups)
      }
    } catch (e) {
      logError('VideosTab:loadQueue', e)
    } finally {
      setLoadingQueue(false)
    }
  }, [])

  useEffect(() => {
    void loadStats()
    void loadQueue()
  }, [loadStats, loadQueue])

  const runPipeline = useCallback(async () => {
    setRunning(true)
    setError(null)
    setLastResult(null)
    try {
      const res = await fetch('/api/admin/exercise-videos/auto-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit }),
      })
      const json = await res.json().catch(() => null)
      if (!json || !res.ok || !json.ok) {
        setError(json?.error || `Erro HTTP ${res.status}`)
        return
      }
      setLastResult(json as PipelineResult)
      // Recarrega stats e queue depois
      await Promise.all([loadStats(), loadQueue()])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro de rede')
    } finally {
      setRunning(false)
    }
  }, [limit, loadStats, loadQueue])

  const reviewAction = useCallback(async (videoId: string, action: 'approve' | 'reject') => {
    setActingOn(videoId)
    try {
      const res = await fetch('/api/admin/exercise-videos/review-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: videoId, action }),
      })
      const json = await res.json().catch(() => null)
      if (!json || !res.ok || !json.ok) {
        setError(json?.error || `Erro HTTP ${res.status}`)
        return
      }
      // Refresh otimizado: remove o vídeo localmente e recarrega stats
      await Promise.all([loadStats(), loadQueue()])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro de rede')
    } finally {
      setActingOn(null)
    }
  }, [loadStats, loadQueue])

  // Stats derivadas
  const missingCount = (totalExercises ?? 0) - (exercisesWithVideo ?? 0)
  const coveragePct = totalExercises ? Math.round(((exercisesWithVideo ?? 0) / totalExercises) * 100) : 0

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Video size={20} className="text-yellow-500" />
            Vídeos demonstrativos
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Pipeline IA cobre exercícios sem vídeo automaticamente.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { void loadStats(); void loadQueue() }}
          disabled={loadingStats || loadingQueue}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold text-neutral-300 hover:text-white hover:bg-white/5 disabled:opacity-50 transition-all"
          style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          {(loadingStats || loadingQueue) ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Atualizar
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="Cobertura" value={`${coveragePct}%`} sub={`${exercisesWithVideo ?? '-'} / ${totalExercises ?? '-'}`} tone="yellow" />
        <StatCard label="Sem vídeo" value={String(missingCount)} sub="Buracos pra cobrir" tone="red" />
        <StatCard label="Auto-aprovados" value={String(autoApprovedCount ?? '-')} sub="Pela IA" tone="emerald" />
        <StatCard label="Aguardando revisão" value={String(pendingReviewCount ?? '-')} sub="Score 50-79" tone="amber" />
      </div>

      {/* Pipeline runner */}
      <div
        className="rounded-2xl p-5 space-y-3"
        style={{ background: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.22)' }}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-yellow-400" />
          <h3 className="text-sm font-black text-white">Rodar pipeline agora</h3>
        </div>
        <p className="text-xs text-neutral-400 leading-relaxed">
          Processa um lote de exercícios sem vídeo. A IA busca no YouTube, pontua cada candidato
          (canal whitelisted + título + duração + views) e decide:
          <br />
          <span className="text-emerald-400 font-bold">≥80</span> auto-aprova ·{' '}
          <span className="text-amber-400 font-bold">50-79</span> fila de revisão ·{' '}
          <span className="text-neutral-400 font-bold">&lt;50</span> descarta
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="pipeline-limit" className="text-[11px] uppercase tracking-wider font-bold text-neutral-400">
            Tamanho do lote:
          </label>
          <select
            id="pipeline-limit"
            aria-label="Tamanho do lote do pipeline"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            disabled={running}
            className="rounded-lg px-3 py-1.5 text-sm text-white font-bold"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <option value={5}>5 exercícios</option>
            <option value={10}>10 exercícios</option>
            <option value={20}>20 exercícios</option>
            <option value={30}>30 exercícios (máx)</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => void runPipeline()}
          disabled={running}
          className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-black disabled:opacity-50 transition-all active:scale-95"
        >
          {running ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {running ? 'Processando...' : `Rodar pipeline em ${limit} exercícios`}
        </button>

        {lastResult && (
          <div className="rounded-xl p-3 text-xs space-y-1.5" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <CheckCircle2 size={14} /> Pipeline concluído
            </div>
            <div className="text-neutral-300">
              Processados: <span className="font-bold text-white">{lastResult.processed}</span>
              {' · '}Auto-aprovados: <span className="font-bold text-emerald-400">{lastResult.auto_approved}</span>
              {' · '}Pra revisão: <span className="font-bold text-amber-400">{lastResult.pending_review}</span>
              {' · '}Sem match: <span className="font-bold text-neutral-400">{lastResult.no_candidates}</span>
              {lastResult.errors > 0 && (
                <>{' · '}<span className="font-bold text-red-400">Erros: {lastResult.errors}</span></>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl p-3 flex gap-2 text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-red-200">{error}</p>
          </div>
        )}
      </div>

      {/* Review queue */}
      {queue.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 px-1 flex items-center gap-2">
            <AlertCircle size={11} className="text-amber-400" />
            Aguardando sua revisão ({queue.length} exercícios)
          </h3>

          {queue.map((group) => (
            <div
              key={group.exercise_library_id}
              className="rounded-2xl p-4"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <h4 className="text-sm font-black text-white truncate">{group.exercise_name}</h4>
                <span className="text-[10px] uppercase tracking-wider font-bold text-neutral-400">
                  {group.candidates.length} sugestões
                </span>
              </div>
              <div className="space-y-2">
                {group.candidates.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-start gap-2 p-2.5 rounded-xl"
                    style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 w-10 h-10 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center hover:bg-red-500/30 transition-colors"
                      title="Abrir no YouTube"
                      aria-label={`Reproduzir ${c.title} no YouTube`}
                    >
                      <Play size={14} className="text-red-400 fill-red-400" aria-hidden="true" />
                    </a>
                    <div className="flex-1 min-w-0">
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-bold text-white hover:underline truncate block flex items-center gap-1"
                      >
                        {c.title}
                        <ExternalLink size={10} className="text-neutral-400 shrink-0" />
                      </a>
                      <div className="text-[10px] text-neutral-400 mt-0.5 truncate">
                        {c.channel_title}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[10px]">
                        <span className="font-bold text-amber-400">
                          Score: {c.quality_score != null ? Math.round(c.quality_score) : '?'}
                        </span>
                        {c.score_breakdown?.reason && (
                          <span className="text-neutral-400 truncate">· {c.score_breakdown.reason}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => void reviewAction(c.id, 'approve')}
                        disabled={actingOn === c.id}
                        className="w-8 h-8 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 flex items-center justify-center transition-all disabled:opacity-50"
                        title="Aprovar este vídeo"
                        aria-label="Aprovar"
                      >
                        {actingOn === c.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => void reviewAction(c.id, 'reject')}
                        disabled={actingOn === c.id}
                        className="w-8 h-8 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 flex items-center justify-center transition-all disabled:opacity-50"
                        title="Rejeitar este vídeo"
                        aria-label="Rejeitar"
                      >
                        <XCircle size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {queue.length === 0 && !loadingQueue && (
        <div
          className="rounded-2xl p-6 text-center"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <CheckCircle2 size={28} className="text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-bold text-white">Sem vídeos aguardando revisão</p>
          <p className="text-xs text-neutral-400 mt-1">
            Rode o pipeline pra processar mais exercícios sem vídeo.
          </p>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Helpers locais
// ──────────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: string
  sub: string
  tone: 'yellow' | 'red' | 'emerald' | 'amber'
}

const StatCard: React.FC<StatCardProps> = ({ label, value, sub, tone }) => {
  const toneMap = {
    yellow: { bg: 'rgba(234,179,8,0.08)', text: 'text-yellow-400' },
    red: { bg: 'rgba(239,68,68,0.08)', text: 'text-red-400' },
    emerald: { bg: 'rgba(34,197,94,0.08)', text: 'text-emerald-400' },
    amber: { bg: 'rgba(245,158,11,0.08)', text: 'text-amber-400' },
  }[tone]
  return (
    <div
      className="rounded-2xl p-3"
      style={{ background: toneMap.bg, border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-black mt-1 ${toneMap.text}`}>{value}</div>
      <div className="text-[10px] text-neutral-400 mt-0.5 truncate">{sub}</div>
    </div>
  )
}
