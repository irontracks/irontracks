'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { X, Save } from 'lucide-react'
import { useDialog } from '@/contexts/DialogContext'

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
