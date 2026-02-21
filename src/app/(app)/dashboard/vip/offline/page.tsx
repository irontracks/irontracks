'use client'

import { useEffect, useMemo, useState } from 'react'
import NutritionConsoleShell from '@/components/dashboard/nutrition/NutritionConsoleShell'
import OfflineSyncModal from '@/components/OfflineSyncModal'
import GlobalDialog from '@/components/GlobalDialog'
import { DialogProvider } from '@/contexts/DialogContext'
import { createClient } from '@/utils/supabase/client'
import { getErrorMessage } from '@/utils/errorMessage'

type VipAccess = {
  ok: boolean
  entitlement?: {
    limits?: {
      offline?: boolean
    }
  }
  error?: string
}

export default function VipOfflinePage() {
  const supabase = useMemo(() => createClient(), [])
  const [access, setAccess] = useState<VipAccess | null>(null)
  const [accessError, setAccessError] = useState('')
  const [userId, setUserId] = useState('')
  const [open, setOpen] = useState(false)

  const canUseOffline = useMemo(() => !!access?.entitlement?.limits?.offline, [access?.entitlement?.limits?.offline])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/vip/access', { method: 'GET', credentials: 'include', cache: 'no-store' })
        const json = (await res.json().catch((): null => null)) as VipAccess | null
        if (cancelled) return
        if (!json?.ok) {
          setAccess(null)
          setAccessError(String(json?.error || 'Falha ao carregar acesso VIP.'))
          return
        }
        setAccess(json)
      } catch (e: unknown) {
        if (!cancelled) setAccessError(getErrorMessage(e) ? String(getErrorMessage(e)) : 'Falha ao carregar acesso VIP.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabase.auth.getUser()
        const uid = String(data?.user?.id || '').trim()
        if (cancelled) return
        setUserId(uid)
        if (uid && canUseOffline) setOpen(true)
      } catch {
        if (!cancelled) setUserId('')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canUseOffline, supabase])

  return (
    <DialogProvider>
      <NutritionConsoleShell title="Modo offline" subtitle="VIP Pro+">
        <div className="space-y-4">
          <div className="rounded-3xl bg-neutral-900/85 border border-neutral-800 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.5)] ring-1 ring-neutral-800/70">
            <div className="text-[10px] uppercase tracking-[0.24em] text-neutral-400">Offline</div>
            <div className="mt-2 text-sm font-semibold text-white">Central de pendências</div>
            <div className="mt-1 text-xs text-neutral-400">Veja e sincronize ações pendentes quando a conexão voltar.</div>

            {accessError ? <div className="mt-4 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">{accessError}</div> : null}

            {access && !canUseOffline ? (
              <div className="mt-4 rounded-2xl border border-yellow-500/25 bg-yellow-500/10 p-4 text-sm text-yellow-100">
                Este recurso é exclusivo do <span className="font-semibold">VIP Pro</span> e <span className="font-semibold">VIP Elite</span>.
                <button
                  type="button"
                  onClick={() => (window.location.href = '/marketplace')}
                  className="mt-3 inline-flex items-center justify-center rounded-xl bg-yellow-500 text-black font-semibold px-4 py-2 shadow-lg shadow-yellow-500/20 active:scale-95 transition duration-300"
                >
                  Ver planos
                </button>
              </div>
            ) : (
              <div className="mt-4 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  disabled={!userId}
                  className="rounded-2xl bg-neutral-950/60 border border-neutral-800 px-4 py-2 text-xs font-semibold text-neutral-100 hover:bg-neutral-950 disabled:opacity-60"
                >
                  Abrir central
                </button>
              </div>
            )}
          </div>
        </div>

        <OfflineSyncModal open={open} onClose={() => setOpen(false)} userId={userId} />
      </NutritionConsoleShell>
      <GlobalDialog />
    </DialogProvider>
  )
}
