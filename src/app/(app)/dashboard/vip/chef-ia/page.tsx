'use client'

import { useEffect, useMemo, useState } from 'react'
import NutritionConsoleShell from '@/components/dashboard/nutrition/NutritionConsoleShell'
import { getErrorMessage } from '@/utils/errorMessage'

type VipAccess = {
  ok: boolean
  hasVip?: boolean
  role?: string | null
  entitlement?: {
    tier?: string
    limits?: {
      chef_ai?: boolean
    }
  }
  error?: string
}

type ChefResult = {
  title: string
  portions: number
  ingredients: string[]
  steps: string[]
  macros?: { calories: number; protein: number; carbs: number; fat: number } | null
}

export default function VipChefIaPage() {
  const [access, setAccess] = useState<VipAccess | null>(null)
  const [accessError, setAccessError] = useState('')
  const [loadingAccess, setLoadingAccess] = useState(true)

  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ChefResult | null>(null)

  const canUseChef = useMemo(() => {
    const allowed = !!access?.entitlement?.limits?.chef_ai
    return allowed
  }, [access?.entitlement?.limits?.chef_ai])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoadingAccess(true)
        setAccessError('')
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
      } finally {
        if (!cancelled) setLoadingAccess(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const submit = async () => {
    const text = String(prompt || '').trim()
    if (!text) return
    if (busy) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/ai/chef-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const json = await res.json().catch((): null => null)
      if (!json?.ok) {
        const upgradeRequired = !!json?.upgradeRequired || String(json?.error || '') === 'vip_required'
        setError(upgradeRequired ? 'Disponível no VIP Elite.' : String(json?.error || 'Falha ao gerar plano.'))
        return
      }
      const data = json?.data
      if (!data || typeof data !== 'object') {
        setError('Resposta inválida.')
        return
      }
      setResult(data as ChefResult)
    } catch (e: unknown) {
      setError(getErrorMessage(e) ? String(getErrorMessage(e)) : 'Falha ao gerar plano.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <NutritionConsoleShell title="Chef IA" subtitle="VIP Elite">
      <div className="space-y-4">
        <div className="rounded-3xl bg-neutral-900/85 border border-neutral-800 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.5)] ring-1 ring-neutral-800/70">
          <div className="text-[10px] uppercase tracking-[0.24em] text-neutral-400">Chef IA</div>
          <div className="mt-2 text-sm font-semibold text-white">Planos e receitas sob medida</div>
          <div className="mt-1 text-xs text-neutral-400">
            Peça uma refeição com objetivo (cut/bulk/manutenção), restrições e preferências. Eu devolvo receita, passo a passo e macros estimados.
          </div>

          {loadingAccess ? (
            <div className="mt-4 text-xs text-neutral-400">Verificando acesso...</div>
          ) : accessError ? (
            <div className="mt-4 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">{accessError}</div>
          ) : !canUseChef ? (
            <div className="mt-4 rounded-2xl border border-yellow-500/25 bg-yellow-500/10 p-4 text-sm text-yellow-100">
              Este recurso é exclusivo do <span className="font-semibold">VIP Elite</span>.
              <button
                type="button"
                onClick={() => (window.location.href = '/marketplace')}
                className="mt-3 inline-flex items-center justify-center rounded-xl bg-yellow-500 text-black font-semibold px-4 py-2 shadow-lg shadow-yellow-500/20 active:scale-95 transition duration-300"
              >
                Ver planos
              </button>
            </div>
          ) : (
            <>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                className="mt-4 w-full rounded-2xl bg-neutral-950/70 border border-neutral-800 px-4 py-3 text-sm font-semibold text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/40 resize-none shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
                placeholder="Ex.: Jantar para cutting, 40g proteína, sem lactose, barato e rápido. Tenho frango, arroz, ovos e legumes."
              />
              {error ? <div className="mt-3 text-sm text-red-200">{error}</div> : null}
              <div className="mt-3 flex items-center justify-end">
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy}
                  className="rounded-2xl bg-yellow-500 px-4 py-2 text-xs font-semibold text-black hover:bg-yellow-400 disabled:opacity-60 shadow-lg shadow-yellow-500/20 active:scale-95 transition duration-300"
                >
                  {busy ? 'Gerando...' : 'Gerar receita'}
                </button>
              </div>
            </>
          )}
        </div>

        {result ? (
          <div className="rounded-3xl bg-neutral-900/85 border border-neutral-800 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.5)] ring-1 ring-neutral-800/70">
            <div className="text-sm font-semibold text-white">{String(result.title || '').trim() || 'Receita'}</div>
            {result.macros ? (
              <div className="mt-2 text-xs text-neutral-300">
                {Math.round(result.macros.calories)} kcal · P {Math.round(result.macros.protein)}g · C {Math.round(result.macros.carbs)}g · G {Math.round(result.macros.fat)}g · {Math.max(1, Number(result.portions || 1))} porção(ões)
              </div>
            ) : (
              <div className="mt-2 text-xs text-neutral-400">{Math.max(1, Number(result.portions || 1))} porção(ões)</div>
            )}

            <div className="mt-4">
              <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-400">Ingredientes</div>
              <div className="mt-2 space-y-1 text-sm text-neutral-200">
                {(Array.isArray(result.ingredients) ? result.ingredients : []).map((it, idx) => (
                  <div key={`${idx}-${it}`} className="text-sm text-neutral-200">
                    - {String(it || '').trim()}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-400">Passo a passo</div>
              <div className="mt-2 space-y-2 text-sm text-neutral-200">
                {(Array.isArray(result.steps) ? result.steps : []).map((st, idx) => (
                  <div key={`${idx}-${st}`} className="text-sm text-neutral-200">
                    {idx + 1}. {String(st || '').trim()}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </NutritionConsoleShell>
  )
}
