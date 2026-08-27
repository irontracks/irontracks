'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw, Flame, Trophy, Activity, Moon } from 'lucide-react'
import { getErrorMessage } from '@/utils/errorMessage'
import { translateAiError } from '@/utils/ai/clientErrors'

type WeeklySummary = {
  ok: boolean
  summaryText?: string
  dataUsed?: string[]
  trainedDays?: number
  checkins?: { energy: number | null; satisfaction: number | null; soreness: number | null; sleep: number | null }
  scales?: { energy: number; soreness: number; satisfaction: number; rpe: number }
  prs?: unknown[]
  error?: string
}

const safeArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

export default function VipWeeklySummaryCard() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<WeeklySummary | null>(null)
  const [error, setError] = useState('')
  const inFlightRef = useRef(false)

  const load = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/vip/weekly-summary', { method: 'GET', credentials: 'include', cache: 'no-store' })
      const json = (await res.json().catch((): null => null)) as WeeklySummary | null
      if (!json?.ok) {
        setData(null)
        const raw = String(json?.error || '')
        // Keep 'vip_required' raw so the upgrade-CTA branch in the JSX
        // can detect it. Everything else goes through translateAiError to
        // hide canonical codes like 'ai_rate_limited' / 'rate_limit_exceeded'.
        setError(raw === 'vip_required' ? 'vip_required' : translateAiError(raw))
        return
      }
      setData(json)
    } catch (e: unknown) {
      setData(null)
      setError(getErrorMessage(e) ? String(getErrorMessage(e)) : 'Falha ao carregar resumo semanal.')
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const dataUsed = useMemo(() => safeArray<string>(data?.dataUsed), [data?.dataUsed])
  const trainedDays = data?.trainedDays ?? 0
  const prsCount = safeArray(data?.prs).length
  const prsList = useMemo(
    () =>
      safeArray(data?.prs)
        .map((raw) => {
          const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
          return {
            exercise: String(p.exercise || '').trim(),
            weight: Number(p.weight) || 0,
            reps: Number(p.reps) || 0,
          }
        })
        .filter((p) => p.exercise),
    [data?.prs],
  )
  const checkins = data?.checkins
  const energyScale = data?.scales?.energy ?? 5

  return (
    <div className="rounded-2xl p-[1px]" style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.2) 0%, rgba(255,255,255,0.03) 50%, rgba(234,179,8,0.08) 100%)' }}>
      <div className="rounded-2xl p-4" style={{ background: 'rgba(12,12,12,0.99)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#f59e0b' }}>Resumo semanal</div>
            <div className="text-white font-black text-sm">Últimos 7 dias</div>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black text-neutral-300 hover:text-white disabled:opacity-60 transition-all active:scale-95"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Carregando' : 'Atualizar'}
          </button>
        </div>

        {error ? (
          error === 'vip_required' ? (
            <div className="mt-3 rounded-xl border border-yellow-500/25 bg-yellow-500/10 p-3 text-sm text-yellow-100 flex items-center justify-between gap-3">
              <div className="min-w-0">Disponível para assinantes VIP.</div>
              <button
                type="button"
                onClick={() => (window.location.href = '/marketplace')}
                className="shrink-0 rounded-xl bg-yellow-500 px-3 py-2 text-xs font-black text-black hover:bg-yellow-400"
              >
                Ver planos
              </button>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
          )
        ) : null}

        {/* ── Metric Cards ──────────────────────────────────────────── */}
        {data && !error && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* Dias treinados */}
            <div className="rounded-xl p-3" style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.12)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Flame size={14} className="text-yellow-500" />
                <span className="text-[9px] font-black uppercase tracking-widest text-yellow-600">Treinos</span>
              </div>
              <div className="text-xl font-black text-white">{trainedDays}</div>
              <div className="text-[10px] text-neutral-400">dia{trainedDays !== 1 ? 's' : ''}</div>
            </div>

            {/* PRs */}
            <div className="rounded-xl p-3" style={{ background: prsCount > 0 ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${prsCount > 0 ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Trophy size={14} className={prsCount > 0 ? 'text-amber-400' : 'text-neutral-600'} />
                <span className="text-[9px] font-black uppercase tracking-widest text-amber-500">Recordes</span>
              </div>
              <div className="text-xl font-black text-white">{prsCount}</div>
              <div className="text-[10px] text-neutral-400">PR{prsCount !== 1 ? 's' : ''} esta semana</div>
            </div>

            {/* Energia */}
            {checkins?.energy != null && (
              <div className="rounded-xl p-3" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.12)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Activity size={14} className="text-green-400" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-green-600">Energia</span>
                </div>
                <div className="text-xl font-black text-white">{Math.round(checkins.energy * 10) / 10}</div>
                {/* A escala é 1–5 ('Ótimo/Normal/Cansado'), não 0–10 — sem o rótulo,
                    um 5 (o máximo possível) parecia nota medíocre. */}
                <div className="text-[10px] text-neutral-400">média de {energyScale}</div>
              </div>
            )}

            {/* Sono */}
            {checkins?.sleep != null && (
              <div className="rounded-xl p-3" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Moon size={14} className="text-amber-400" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-amber-500">Sono</span>
                </div>
                {/* A API entrega `sleep_hours` — HORAS. Sem a unidade, "7.5" ao
                    lado de uma Energia que diz "média de 5" lê como NOTA numa
                    escala, e 7,5 de sono (ótimo) parece mediano. O próprio
                    prompt da IA já escreve "Sono médio: 7.5h". */}
                <div className="text-xl font-black text-white">
                  {Math.round(checkins.sleep * 10) / 10}
                  <span className="text-sm font-bold text-neutral-400 ml-0.5">h</span>
                </div>
                <div className="text-[10px] text-neutral-400">média por noite</div>
              </div>
            )}
          </div>
        )}

        {/* ── PRs da semana ─────────────────────────────────────────────
            Aqui ficava o `summaryText` cru vindo da API: uma lista com hífen e
            "0 dia(s) treinado(s)" — saída de log, na tela que o usuário PAGA
            para ver. Pior: repetia em texto os mesmos números que os blocos
            acima já mostram. Sobrou o que só existia lá: quais foram os PRs.
            O texto continua no payload para quem consome a API. */}
        {prsList.length ? (
          <div className="mt-3 rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">Recordes da semana</div>
            <div className="space-y-1.5">
              {prsList.slice(0, 3).map((pr, i) => (
                <div key={`${pr.exercise}-${i}`} className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-neutral-200 truncate">{pr.exercise}</span>
                  <span className="text-sm font-black text-white tabular-nums shrink-0">
                    {pr.weight}<span className="text-neutral-400 font-bold"> kg × </span>{pr.reps}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : !error && data && !trainedDays ? (
          <div className="mt-3 text-sm text-neutral-400">Nenhum treino nos últimos 7 dias.</div>
        ) : null}

        {/* Estes chips são a PROVENIÊNCIA do resumo — o que a IA leu para
            escrever —, não métricas. Sem rótulo, o primeiro deles ("4 dias
            treinados (últimos 7d)") lia como repetição burra do card de cima,
            que mostra o mesmo 4 em corpo 20. Com "Baseado em", o mesmo número
            passa a ter papel próprio: lá é o dado, aqui é a fonte.
            Mesma armadilha que já derrubou o `summaryText` cru logo acima —
            número repetido sem contexto vira ruído, mesmo quando o dado é o
            certo. */}
        {dataUsed.length ? (
          <div className="mt-3">
            <div className="text-[9px] font-black uppercase tracking-widest text-neutral-400 mb-1.5">Baseado em</div>
            <div className="flex flex-wrap gap-1.5">
            {dataUsed.map((x) => (
              <div key={x} className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 px-2 py-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                {x}
              </div>
            ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
