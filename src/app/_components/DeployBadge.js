'use client'

import { useEffect, useMemo, useState } from 'react'

export default function DeployBadge() {
  const [info, setInfo] = useState(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        const data = await res.json().catch(() => null)
        if (cancelled) return
        if (data && data.ok) setInfo(data)
      } catch {
      }
    }

    load()
    const t = setInterval(load, 120000)

    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  const text = useMemo(() => {
    const v = info?.version ? `v${String(info.version)}` : null
    const sha = info?.commitSha ? String(info.commitSha).slice(0, 7) : null
    const ref = info?.commitRef ? String(info.commitRef) : null
    const parts = [v, sha || ref].filter(Boolean)
    return parts.join(' · ')
  }, [info?.commitRef, info?.commitSha, info?.version])

  if (!text) return null

  return (
    <button
      type="button"
      onClick={() => {
        try {
          window.location.reload()
        } catch {
        }
      }}
      className="fixed bottom-3 right-3 z-[9999] rounded-full border border-white/10 bg-black/50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/70 backdrop-blur"
      aria-label="Recarregar para atualizar"
      title="Clique para recarregar"
    >
      {text}
    </button>
  )
}

