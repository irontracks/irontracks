'use client'

import { useState, useEffect } from 'react'

interface GymPerson {
  user_id: string
  display_name: string
  avatar_url: string | null
  checked_in_at: string
}

interface GymPresenceCardProps {
  gymId: string | null
  gymName: string | null
}

export default function GymPresenceCard({ gymId, gymName }: GymPresenceCardProps) {
  const [people, setPeople] = useState<GymPerson[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!gymId) return
    setLoading(true)
    fetch(`/api/social/gym-presence?gym_id=${gymId}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setPeople(d.present || []) })
      .catch(() => { /* intentional: non-critical */ })
      .finally(() => setLoading(false))
  }, [gymId])

  if (!gymId || (!loading && people.length === 0)) return null

  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        background: 'rgba(15,15,15,0.98)',
        borderColor: 'rgba(234,179,8,0.15)',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">👥</span>
        <div>
          <h3 className="text-sm font-bold text-white">Treinando agora</h3>
          {gymName && <p className="text-xs text-white/40">{gymName}</p>}
        </div>
      </div>

      {loading ? (
        <div className="flex gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-10 w-10 rounded-full bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {people.map(person => (
            <div
              key={person.user_id}
              className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              {person.avatar_url ? (
                <img
                  src={person.avatar_url}
                  alt=""
                  className="h-7 w-7 rounded-full object-cover"
                />
              ) : (
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-black"
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                >
                  {person.display_name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-xs font-medium text-white/70">{person.display_name}</span>
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: '#22c55e', boxShadow: '0 0 4px rgba(34,197,94,0.5)' }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
