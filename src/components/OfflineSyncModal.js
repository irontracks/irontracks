import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, RefreshCw, Trash2, X, Bug, Clock } from 'lucide-react'
import { bumpOfflineJob, clearOfflineJobs, flushOfflineQueue, getOfflineQueueSummary, isOnline } from '@/lib/offline/offlineSync'
import { useDialog } from '@/contexts/DialogContext'

const formatEta = (ms) => {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return ''
  const diff = n - Date.now()
  if (!Number.isFinite(diff)) return ''
  if (diff <= 0) return 'agora'
  const s = Math.round(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}min`
  const h = Math.round(m / 60)
  return `${h}h`
}

const labelForType = (t) => {
  const type = String(t || '')
  if (type === 'workout_finish') return 'Finalizar treino'
  return type || 'Job'
}

export default function OfflineSyncModal({ open, onClose, userId }) {
  const { confirm, alert } = useDialog()
  const uid = String(userId || '').trim()
  const [state, setState] = useState({ online: true, pending: 0, failed: 0, due: 0, nextDueAt: null, jobs: [] })
  const [busy, setBusy] = useState(false)

  const hasJobs = (Number(state?.pending || 0) + Number(state?.failed || 0)) > 0

  const refresh = useCallback(async () => {
    if (!uid) return
    const res = await getOfflineQueueSummary({ userId: uid })
    if (res?.ok) setState(res)
    else setState((prev) => ({ ...(prev || {}), online: isOnline() }))
  }, [uid])

  useEffect(() => {
    if (!open) return
    refresh()
    const t = setInterval(() => refresh(), 2500)
    return () => clearInterval(t)
  }, [open, refresh])

  const jobs = useMemo(() => (Array.isArray(state?.jobs) ? state.jobs : []), [state?.jobs])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[1600] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe" onClick={() => onClose?.()}>
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-neutral-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-widest text-neutral-500 font-black">Offline Sync</div>
            <div className="text-lg font-black text-white">Central de pendências</div>
            <div className="text-xs text-neutral-400">
              {state?.online === false ? 'Sem internet agora.' : hasJobs ? 'Fila pronta para sincronizar quando possível.' : 'Nenhuma pendência.'}
            </div>
          </div>
          <button type="button" onClick={() => onClose?.()} className="w-10 h-10 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 hover:bg-neutral-900 inline-flex items-center justify-center">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-xl bg-neutral-950 border border-neutral-800 p-3">
              <div className="text-[10px] uppercase tracking-widest text-neutral-500 font-black">Pendentes</div>
              <div className="text-xl font-black text-white">{Number(state?.pending || 0)}</div>
            </div>
            <div className="rounded-xl bg-neutral-950 border border-neutral-800 p-3">
              <div className="text-[10px] uppercase tracking-widest text-neutral-500 font-black">Falhas</div>
              <div className="text-xl font-black text-white">{Number(state?.failed || 0)}</div>
            </div>
            <div className="rounded-xl bg-neutral-950 border border-neutral-800 p-3">
              <div className="text-[10px] uppercase tracking-widest text-neutral-500 font-black">Prontos agora</div>
              <div className="text-xl font-black text-white">{Number(state?.due || 0)}</div>
            </div>
            <div className="rounded-xl bg-neutral-950 border border-neutral-800 p-3">
              <div className="text-[10px] uppercase tracking-widest text-neutral-500 font-black">Próxima tentativa</div>
              <div className="text-xl font-black text-white">{formatEta(state?.nextDueAt)}</div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              disabled={busy || state?.online === false || !hasJobs}
              onClick={async () => {
                setBusy(true)
                try {
                  await flushOfflineQueue({ max: 12, force: true })
                } finally {
                  setBusy(false)
                  await refresh()
                }
              }}
              className="min-h-[44px] flex-1 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              <RefreshCw size={18} />
              Tentar agora
            </button>
            <button
              type="button"
              disabled={busy || !hasJobs}
              onClick={async () => {
                const ok = await confirm('Limpar todas as pendências offline deste usuário?')
                if (!ok) return
                setBusy(true)
                try {
                  await clearOfflineJobs({ userId: uid })
                } finally {
                  setBusy(false)
                  await refresh()
                }
              }}
              className="min-h-[44px] rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 font-black hover:bg-neutral-900 disabled:opacity-60 inline-flex items-center justify-center gap-2 px-4"
            >
              <Trash2 size={18} />
              Limpar tudo
            </button>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 overflow-hidden">
            <div className="p-3 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div className="text-xs font-black uppercase tracking-widest text-neutral-500">Jobs</div>
              {state?.online === false ? (
                <div className="text-[11px] font-black uppercase tracking-widest text-red-300 bg-red-500/10 border border-red-500/30 px-2.5 py-1 rounded-xl inline-flex items-center gap-2">
                  <AlertTriangle size={14} />
                  Offline
                </div>
              ) : null}
            </div>
            <div className="max-h-[44vh] overflow-y-auto custom-scrollbar">
              {jobs.length === 0 ? (
                <div className="p-4 text-sm text-neutral-400">Nenhuma pendência encontrada.</div>
              ) : (
                <div className="divide-y divide-neutral-800">
                  {jobs.map((j) => {
                    const id = String(j?.id || '')
                    const status = String(j?.status || 'pending')
                    const attempts = Number(j?.attempts || 0)
                    const maxAttempts = Number(j?.maxAttempts || 0) || 7
                    const nextAt = Number(j?.nextAttemptAt) || 0
                    const lastError = String(j?.lastError || '').trim()
                    const tone = status === 'failed' ? 'border-red-500/20 bg-red-500/10' : 'border-neutral-800 bg-neutral-900/30'
                    return (
                      <div key={id} className={`p-3 ${tone}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-black text-white">{labelForType(j?.type)}</div>
                            <div className="text-[11px] text-neutral-400 font-mono truncate">{id}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-widest text-neutral-300">
                              <span className="px-2 py-1 rounded-xl bg-neutral-950 border border-neutral-800">Tentativas: {attempts}/{maxAttempts}</span>
                              {status === 'failed' ? (
                                <span className="px-2 py-1 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200">Falhou</span>
                              ) : (
                                <span className="px-2 py-1 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 inline-flex items-center gap-2">
                                  <Clock size={12} />
                                  {formatEta(nextAt)}
                                </span>
                              )}
                            </div>
                            {lastError ? (
                              <div className="mt-2 text-xs text-red-200 break-words">{lastError}</div>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                setBusy(true)
                                try {
                                  await bumpOfflineJob({ id })
                                  await flushOfflineQueue({ max: 8, force: true })
                                } finally {
                                  setBusy(false)
                                  await refresh()
                                }
                              }}
                              className="h-9 px-3 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 disabled:opacity-60"
                            >
                              Retry
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                try {
                                  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                                    const err = new Error(lastError || `Offline job ${labelForType(j?.type)} falhou`)
                                    window.dispatchEvent(new CustomEvent('irontracks:error', {
                                      detail: {
                                        error: err,
                                        source: 'offline_sync',
                                        meta: { job: j },
                                      },
                                    }))
                                  }
                                  await alert('Janela de reporte aberta. Obrigado!', 'Reportar')
                                } catch {}
                              }}
                              className="h-9 w-10 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 font-black hover:bg-neutral-900 disabled:opacity-60 inline-flex items-center justify-center"
                              title="Reportar"
                            >
                              <Bug size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
