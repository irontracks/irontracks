'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { X, Save, Download, Trash2, RotateCcw } from 'lucide-react'
import { useDialog } from '@/contexts/DialogContext'
import { DEFAULT_SETTINGS } from '@/hooks/useUserSettings'

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v)

export default function SettingsModal(props) {
  const { alert } = useDialog()
  const isOpen = !!props?.isOpen
  const saving = !!props?.saving
  const rawSettings = props?.settings
  const base = useMemo(() => (isObject(rawSettings) ? rawSettings : {}), [rawSettings])
  const [draft, setDraft] = useState(() => base)

  const setValue = (key, value) => {
    if (!key) return
    setDraft((prev) => ({ ...(isObject(prev) ? prev : {}), [key]: value }))
  }

  const density = String(draft?.dashboardDensity || 'comfortable')
  const units = String(draft?.units || 'kg')
  const enableSounds = Boolean(draft?.enableSounds ?? true)
  const allowTeamInvites = Boolean(draft?.allowTeamInvites ?? true)
  const soundVolume = Math.max(0, Math.min(100, Number(draft?.soundVolume ?? 100) || 0))
  const inAppToasts = Boolean(draft?.inAppToasts ?? true)
  const notificationPermissionPrompt = Boolean(draft?.notificationPermissionPrompt ?? true)
  const restTimerNotify = Boolean(draft?.restTimerNotify ?? true)
  const restTimerVibrate = Boolean(draft?.restTimerVibrate ?? true)
  const restTimerRepeatAlarm = Boolean(draft?.restTimerRepeatAlarm ?? true)
  const restTimerRepeatIntervalMs = Math.max(600, Math.min(6000, Number(draft?.restTimerRepeatIntervalMs ?? 1500) || 1500))
  const restTimerTickCountdown = Boolean(draft?.restTimerTickCountdown ?? true)
  const restTimerDefaultSeconds = Math.max(15, Math.min(600, Number(draft?.restTimerDefaultSeconds ?? 90) || 90))
  const autoRestTimerWhenMissing = Boolean(draft?.autoRestTimerWhenMissing ?? false)

  const canSave = isOpen && !saving

  const title = useMemo(() => 'Configurações', [])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      props?.onClose?.()
    }
    try {
      window.addEventListener('keydown', onKeyDown)
    } catch {}
    return () => {
      try {
        window.removeEventListener('keydown', onKeyDown)
      } catch {}
    }
  }, [isOpen, props])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[1300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe">
      <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Personalização</div>
            <div className="text-white font-black text-lg truncate">{title}</div>
          </div>
          <button
            type="button"
            onClick={() => props?.onClose?.()}
            className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
            <div className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-3">Aparência</div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Densidade do Dashboard</div>
                  <div className="text-xs text-neutral-400">Ajusta espaçamento e tamanho dos cards.</div>
                </div>
                <select
                  value={density}
                  onChange={(e) => setValue('dashboardDensity', e.target.value)}
                  className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  <option value="comfortable">Confortável</option>
                  <option value="compact">Compacto</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
            <div className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-3">Treino</div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Unidades</div>
                  <div className="text-xs text-neutral-400">Peso padrão para cargas.</div>
                </div>
                <select
                  value={units}
                  onChange={(e) => setValue('units', e.target.value)}
                  className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  <option value="kg">kg</option>
                  <option value="lb">lb</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Descanso padrão</div>
                  <div className="text-xs text-neutral-400">Usado quando o exercício não tem descanso definido.</div>
                </div>
                <select
                  value={String(restTimerDefaultSeconds)}
                  onChange={(e) => setValue('restTimerDefaultSeconds', Number(e.target.value))}
                  className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  {[30, 45, 60, 90, 120, 150, 180].map((v) => (
                    <option key={v} value={String(v)}>{v}s</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Auto iniciar descanso padrão</div>
                  <div className="text-xs text-neutral-400">Ao concluir série sem descanso, inicia o padrão.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setValue('autoRestTimerWhenMissing', !autoRestTimerWhenMissing)}
                  className={
                    autoRestTimerWhenMissing
                      ? 'px-3 py-2 rounded-xl bg-yellow-500 text-black font-black'
                      : 'px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black'
                  }
                >
                  {autoRestTimerWhenMissing ? 'Ativo' : 'Desligado'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
            <div className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-3">Som e Convites</div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Sons do App</div>
                  <div className="text-xs text-neutral-400">Notificações e feedback sonoro.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setValue('enableSounds', !enableSounds)}
                  className={
                    enableSounds
                      ? 'px-3 py-2 rounded-xl bg-yellow-500 text-black font-black'
                      : 'px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black'
                  }
                >
                  {enableSounds ? 'Ativo' : 'Desligado'}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Volume</div>
                  <div className="text-xs text-neutral-400">Controla intensidade dos sons.</div>
                </div>
                <div className="w-40 flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={soundVolume}
                    onChange={(e) => setValue('soundVolume', Number(e.target.value))}
                    className="w-full accent-yellow-500"
                  />
                  <div className="font-mono text-xs font-bold text-neutral-200 w-10 text-right">{soundVolume}%</div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Convites de Treino em Equipe</div>
                  <div className="text-xs text-neutral-400">Permite receber convites no modal “BORA!”.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setValue('allowTeamInvites', !allowTeamInvites)}
                  className={
                    allowTeamInvites
                      ? 'px-3 py-2 rounded-xl bg-yellow-500 text-black font-black'
                      : 'px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black'
                  }
                >
                  {allowTeamInvites ? 'Ativo' : 'Bloqueado'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
            <div className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-3">Notificações</div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Toasts no app</div>
                  <div className="text-xs text-neutral-400">Mensagens rápidas no topo da tela.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setValue('inAppToasts', !inAppToasts)}
                  className={
                    inAppToasts
                      ? 'px-3 py-2 rounded-xl bg-yellow-500 text-black font-black'
                      : 'px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black'
                  }
                >
                  {inAppToasts ? 'Ativo' : 'Desligado'}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Pedir permissão automaticamente</div>
                  <div className="text-xs text-neutral-400">Evita prompt do navegador ao iniciar treino.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setValue('notificationPermissionPrompt', !notificationPermissionPrompt)}
                  className={
                    notificationPermissionPrompt
                      ? 'px-3 py-2 rounded-xl bg-yellow-500 text-black font-black'
                      : 'px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black'
                  }
                >
                  {notificationPermissionPrompt ? 'Ativo' : 'Desligado'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
            <div className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-3">Timer</div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Notificar ao terminar</div>
                  <div className="text-xs text-neutral-400">Mostra notificação do navegador (se permitido).</div>
                </div>
                <button
                  type="button"
                  onClick={() => setValue('restTimerNotify', !restTimerNotify)}
                  className={
                    restTimerNotify
                      ? 'px-3 py-2 rounded-xl bg-yellow-500 text-black font-black'
                      : 'px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black'
                  }
                >
                  {restTimerNotify ? 'Ativo' : 'Desligado'}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Vibração</div>
                  <div className="text-xs text-neutral-400">Apenas em celulares compatíveis.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setValue('restTimerVibrate', !restTimerVibrate)}
                  className={
                    restTimerVibrate
                      ? 'px-3 py-2 rounded-xl bg-yellow-500 text-black font-black'
                      : 'px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black'
                  }
                >
                  {restTimerVibrate ? 'Ativo' : 'Desligado'}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Repetir alarme</div>
                  <div className="text-xs text-neutral-400">Toca e vibra até você fechar.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setValue('restTimerRepeatAlarm', !restTimerRepeatAlarm)}
                  className={
                    restTimerRepeatAlarm
                      ? 'px-3 py-2 rounded-xl bg-yellow-500 text-black font-black'
                      : 'px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black'
                  }
                >
                  {restTimerRepeatAlarm ? 'Ativo' : 'Desligado'}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Intervalo do alarme</div>
                  <div className="text-xs text-neutral-400">Quanto tempo entre repetições.</div>
                </div>
                <select
                  value={String(restTimerRepeatIntervalMs)}
                  onChange={(e) => setValue('restTimerRepeatIntervalMs', Number(e.target.value))}
                  className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  {[1000, 1500, 2000, 2500, 3000].map((v) => (
                    <option key={v} value={String(v)}>{(v / 1000).toFixed(1)}s</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Tick nos últimos 5s</div>
                  <div className="text-xs text-neutral-400">Ajuda no ritmo em cluster.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setValue('restTimerTickCountdown', !restTimerTickCountdown)}
                  className={
                    restTimerTickCountdown
                      ? 'px-3 py-2 rounded-xl bg-yellow-500 text-black font-black'
                      : 'px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black'
                  }
                >
                  {restTimerTickCountdown ? 'Ativo' : 'Desligado'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
            <div className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-3">Dados e Dispositivo</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const payload = JSON.stringify(draft && typeof draft === 'object' ? draft : {}, null, 2)
                    const blob = new Blob([payload], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `irontracks-settings-${new Date().toISOString()}.json`
                    document.body.appendChild(a)
                    a.click()
                    a.remove()
                    URL.revokeObjectURL(url)
                  } catch (e) {
                    await alert('Falha ao exportar: ' + (e?.message ?? String(e)))
                  }
                }}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800 inline-flex items-center justify-center gap-2"
              >
                <Download size={16} className="text-yellow-500" />
                Exportar
              </button>

              <button
                type="button"
                onClick={async () => {
                  try {
                    setDraft(DEFAULT_SETTINGS)
                    await alert('Preferências resetadas. Clique em Salvar para aplicar.')
                  } catch (e) {
                    await alert('Falha ao resetar: ' + (e?.message ?? String(e)))
                  }
                }}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800 inline-flex items-center justify-center gap-2"
              >
                <RotateCcw size={16} className="text-yellow-500" />
                Resetar
              </button>

              <button
                type="button"
                onClick={async () => {
                  try {
                    if (typeof window === 'undefined') return
                    const keys = []
                    for (let i = 0; i < window.localStorage.length; i += 1) {
                      const k = window.localStorage.key(i)
                      if (k) keys.push(k)
                    }
                    keys.forEach((k) => {
                      if (k.startsWith('irontracks.')) {
                        try { window.localStorage.removeItem(k) } catch {}
                      }
                    })
                    try { window.location.reload() } catch {}
                  } catch (e) {
                    await alert('Falha ao limpar cache: ' + (e?.message ?? String(e)))
                  }
                }}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800 inline-flex items-center justify-center gap-2"
              >
                <Trash2 size={16} className="text-yellow-500" />
                Limpar cache
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-neutral-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => props?.onClose?.()}
            className="px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700"
          >
            Fechar
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={async () => {
              try {
                const ok = await props?.onSave?.(draft)
                if (ok === false) return
                props?.onClose?.()
              } catch (e) {
                await alert('Falha ao salvar: ' + (e?.message ?? String(e)))
              }
            }}
            className={
              canSave
                ? 'px-4 py-3 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 inline-flex items-center gap-2'
                : 'px-4 py-3 rounded-xl bg-yellow-500/70 text-black font-black cursor-wait inline-flex items-center gap-2'
            }
          >
            <Save size={16} />
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
