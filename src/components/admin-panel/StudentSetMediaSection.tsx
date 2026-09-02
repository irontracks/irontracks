'use client'
import React, { useEffect, useState } from 'react'
import { Camera } from 'lucide-react'
import { groupSetMediaByKey, SET_MEDIA_KIND_LABEL, setMediaStatusText, type SetMediaView } from '@/lib/workout/setMediaView'

/**
 * Painel do professor: fotos/vídeos que o aluno anexou às séries, com a
 * pergunta dele e a resposta da IA (decisão do dono, 02/09/2026 — o coach vê
 * as duas coisas). Lista pela rota `teacher/set-media/by-student`.
 */
export function StudentSetMediaSection({ studentUserId }: { studentUserId: string }) {
  const [items, setItems] = useState<SetMediaView[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const carregar = async () => {
      if (!studentUserId) return
      setLoading(true)
      setErro(null)
      try {
        const r = await fetch(`/api/teacher/set-media/by-student?student_user_id=${encodeURIComponent(studentUserId)}`, { credentials: 'include' })
        const json = await r.json().catch((): null => null)
        if (!alive) return
        if (!r.ok || !json?.ok) { setErro('Não foi possível carregar as mídias.'); setItems([]); return }
        setItems(Object.values(groupSetMediaByKey(json.items)).flat())
      } catch {
        if (alive) setErro('Não foi possível carregar as mídias.')
      } finally {
        if (alive) setLoading(false)
      }
    }
    void carregar()
    return () => { alive = false }
  }, [studentUserId])

  return (
    <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Camera size={16} className="text-yellow-400" />
        <h3 className="text-base font-black text-white tracking-tight">Fotos e vídeos das séries</h3>
      </div>
      <p className="text-xs text-neutral-400 mb-3">O que o aluno anexou nas observações da série, com a resposta da IA ao finalizar o treino.</p>
      {loading && <p className="text-sm text-neutral-400">Carregando…</p>}
      {erro && <p className="text-sm text-red-400">{erro}</p>}
      {!loading && !erro && items.length === 0 && (
        <p className="text-sm text-neutral-400">Nenhuma foto ou vídeo anexado ainda.</p>
      )}
      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((m) => {
            const status = setMediaStatusText(m)
            const kind = SET_MEDIA_KIND_LABEL[m.kind === 'video' ? 'video' : 'photo']
            const quando = m.createdAt ? new Date(m.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
            return (
              <li key={m.id} className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-300">
                  <span className="font-semibold text-white">{m.exerciseName || `Exercício ${m.exerciseIndex + 1}`}</span>
                  <span className="text-neutral-400">· série {m.setIndex + 1}</span>
                  {quando && <span className="text-neutral-400">· {quando}</span>}
                  {m.url ? (
                    <a href={m.url} target="_blank" rel="noreferrer" className="ml-auto rounded-lg border border-neutral-700 px-2 py-1 text-[11px] text-neutral-200 hover:border-yellow-500">
                      {m.kind === 'video' ? '🎥' : '📷'} Abrir {kind.toLowerCase()}
                    </a>
                  ) : null}
                </div>
                {m.question && <p className="text-xs text-neutral-300 italic">Aluno: “{m.question}”</p>}
                {m.aiAnswer ? (
                  <p className="text-xs leading-snug text-neutral-200"><span className="font-semibold text-yellow-300">IA: </span>{m.aiAnswer}</p>
                ) : (
                  status && <p className="text-xs text-neutral-400">{status}</p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default StudentSetMediaSection
