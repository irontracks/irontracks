'use client'

<<<<<<< HEAD
import { useEffect, useState } from 'react'
=======
import { useEffect, useMemo, useState } from 'react'
>>>>>>> 84601ec (minha alteração)

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

<<<<<<< HEAD
  const text = (() => {
=======
  const text = useMemo(() => {
>>>>>>> 84601ec (minha alteração)
    const v = info?.version ? `v${String(info.version)}` : null
    const sha = info?.commitSha ? String(info.commitSha).slice(0, 7) : null
    const ref = info?.commitRef ? String(info.commitRef) : null
    const parts = [v, sha || ref].filter(Boolean)
    return parts.join(' · ')
<<<<<<< HEAD
  })()
=======
  }, [info?.commitRef, info?.commitSha, info?.version])
>>>>>>> 84601ec (minha alteração)

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
<<<<<<< HEAD
=======

>>>>>>> 84601ec (minha alteração)
