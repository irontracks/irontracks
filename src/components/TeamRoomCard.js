import React, { useMemo } from 'react'
import Image from 'next/image'
import { Users, Activity } from 'lucide-react'

const normalizeStatus = (raw) => {
  const s = String(raw || '').toLowerCase().trim()
  if (!s) return 'offline'
  if (s === 'in_workout') return 'in_workout'
  if (s === 'online') return 'online'
  if (s === 'away') return 'away'
  return s
}

const labelForStatus = (s) => {
  if (s === 'in_workout') return 'Em treino'
  if (s === 'online') return 'Online'
  if (s === 'away') return 'Ausente'
  return 'Offline'
}

const classForStatus = (s) => {
  if (s === 'in_workout') return 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30'
  if (s === 'online') return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
  if (s === 'away') return 'bg-neutral-500/15 text-neutral-200 border border-neutral-500/30'
  return 'bg-neutral-900 text-neutral-300 border border-neutral-700'
}

const isStale = (updatedAt, maxAgeMs) => {
  const ms = Date.parse(String(updatedAt || ''))
  if (!Number.isFinite(ms)) return true
  return Date.now() - ms > maxAgeMs
}

const initials = (name) => {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() || '').join('')
}

export default function TeamRoomCard({ teamSession, presence }) {
  const rows = useMemo(() => {
    const participants = Array.isArray(teamSession?.participants) ? teamSession.participants : []
    const presenceMap = presence && typeof presence === 'object' ? presence : {}
    const out = []
    for (const p of participants) {
      const uid = String(p?.uid || '').trim()
      if (!uid) continue
      const name = String(p?.name || 'Atleta').trim()
      const photo = p?.photo ? String(p.photo) : ''
      const raw = presenceMap?.[uid]
      const status = normalizeStatus(raw?.status)
      const stale = isStale(raw?.updatedAt, 60_000)
      const finalStatus = status === 'offline' || stale ? 'offline' : status
      out.push({ uid, name, photo, status: finalStatus })
    }
    return out
  }, [presence, teamSession])

  if (!teamSession?.id) return null

  return (
    <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-yellow-500/10 border border-yellow-500/25 flex items-center justify-center">
            <Activity size={18} className="text-yellow-400" />
          </div>
          <div>
            <div className="text-sm font-black text-white">Sala do treino</div>
            <div className="text-[11px] text-neutral-400">Presença em tempo real</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-neutral-300">
          <Users size={14} className="text-yellow-500" />
          <span>{rows.length}</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {rows.map((r) => (
          <div key={r.uid} className="flex items-center justify-between gap-3 rounded-xl bg-neutral-900/40 border border-neutral-800 px-3 py-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-neutral-800 border border-neutral-700 flex items-center justify-center shrink-0">
                {r.photo ? (
                  <Image src={r.photo} alt={r.name} fill className="object-cover" />
                ) : (
                  <div className="text-[12px] font-black text-neutral-200">{initials(r.name)}</div>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">{r.name}</div>
                <div className="text-[11px] text-neutral-400 truncate">{r.status === 'offline' ? 'Sem sinal recente' : 'Ativo agora'}</div>
              </div>
            </div>
            <div className={`shrink-0 px-2.5 py-1 rounded-xl text-[11px] font-black ${classForStatus(r.status)}`}>
              {labelForStatus(r.status)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
